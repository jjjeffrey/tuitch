#!/usr/bin/env node

var fs = require('fs');
var cp = require('child_process');

var request = require('request');
var blessed = require('blessed');

process.title = 'tuitch';

var screen = blessed.screen({
  log: process.env.HOME + '/blessed.log',
  autoPadding: true,
  fastCSR: true
});

var names = fs.readFileSync('../namelist', 'utf8').split('\n').map(function(value, index, arr) {
  return value.trim();
}).filter(function(value, index, arr) {
  if (value === '' || value[0] === '#') {
    return false;
  } else {
    return true;
  }
});

// Twitch API URLs have a max character limit of 7645
// Twitch usernames have a max character limit of 25 - (28 chars include escaped comma for each name)
// Escaped commas are 3 chars: %2C
// 'https://api.twitch.tv/kraken/streams' 36 chars
// '?channel=' '&limit=100' '&offset=' '0'-'900' - 30 chars
// 7645 - 36 - 30 = 7579
// 7579 / 28 = 270.67857...
// Average name length in my name file is around ~9 chars
// So 7579 / 12 = 631.58...
// So we use 500 instead of something like 270 to minimize the amount of queries needed
var chunks = [];
for (var i = 0; i < names.length; i += 500) {
  chunks.push(names.slice(i, i + 500));
}

var items = {};

function parallel(items, iter, done) {
  var pending = items.length;
  function next(err) {
    --pending || done();
  }
  items.forEach(function(item) {
    iter(item, next);
  });
}

function getOffset(names, offset, callback) {
  var items = {};

  var options = {
    method: 'GET',
    uri: 'https://api.twitch.tv/kraken/streams',
    qs: {
      channel: names.join(','),
      limit: 100,
      offset: offset
    },
    json: true
  };

  return request(options, function(err, res, body) {
    if (err) {
      return callback(err);
    }
    if (!body || typeof body !== 'object' || !body.streams) {
      return callback(new Error('Bad response'));
    }
    items = body.streams.reduce(function(out, stream) {
      out[stream.channel.name] = {
        name: stream.channel.name,
        status: stream.channel.status,
        game: stream.channel.game,
        viewers: stream.viewers
      };
      return out;
    }, {});
    return callback(null, items);
  });
}

function getAll(names, callback, offset, data) {
  var data = data || {};
  var offset = offset || 0;
  return getOffset(names, offset, function(err, items) {
    if (err) return callback(err);
    if (!Object.keys(items).length) {
      return callback(null, data);
    }
    Object.keys(items).forEach(function(key) {
      data[key] = items[key];
    });
    return getAll(names, callback, offset + 100, data);
  });
}

function getChunks(callback) {
  var data = {};
  return parallel(chunks, function(chunk, next) {
    return getAll(chunk, function(err, items) {
      if (err) return next();
      Object.keys(items).forEach(function(key) {
        data[key] = items[key];
      });
      return next();
    });
  }, function() {
    return callback(null, data);
  });
}

function refresh() {
  return getChunks(function(err, _items) {
    if (err) return;
    items = _items;
    var listItems = Object.keys(items).map(function(key) {
      var data = items[key];
      var sep = '{white-fg} - {/white-fg}';
      return data.name 
        + ' {cyan-fg}(' + data.viewers + '){/cyan-fg}'
        + '{|}'
        + '{yellow-fg}' + data.status + '{/yellow-fg}'
        + sep 
        + '{green-fg}' + data.game + '{/green-fg}';
    });
    listItems.sort();
    list.setItems(listItems);
    screen.render();
  });
}

(function next() {
  refresh();
  return setTimeout(next, 4 * 60 * 1000);
})();

var list = blessed.list({
  parent: screen,
  align: 'left',
  mouse: true,
  left: 1,
  top: 0,
  right: 0,
  bottom: 0,
  style: {
    fg: 'blue',
    bg: 'default',
    selected: {
      bg: 'green'
    },
    item: {
      hover: {
        bold: true,
      }
    }
  },
  tags: true,
  items: ['Loading...'],
  keys: true,
  vi: true,
  scrollbar: {
    ch: ' ',
    track: {
      bg: 'yellow'
    },
    style: {
      inverse: true
    }
  }
});

list.on('select', function(el, i) {
  var item = items[el.getText().split(' ')[0]];
  if (!item) return;
  var url = 'http://twitch.tv/' + item.name;
  var args = ['--player', 'mpv --geometry 1280x720+50%+50%', url, 'best'];
  cp.spawn('livestreamer', args, { 
    stdio: 'ignore',
    detached: true 
  });
  screen.render();
});

screen.render();

screen.key('q', function() {
  process.exit(0);
});

screen.key('r', function() {
  refresh();
});
