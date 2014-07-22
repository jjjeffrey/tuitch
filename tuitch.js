var fs = require('fs');
var cp = require('child_process');

var request = require('request');
var blessed = require('blessed');

process.title = 'streams';

var screen = blessed.screen({
  log: process.env.HOME + '/blessed.log',
  autoPadding: true,
  fastCSR: true
});

var names = fs.readFileSync('../namelist','utf8').trim().split('\n');

var chunks = [];
for (var i = 0; i < names.length; i += 658) {
  chunks.push(names.slice(i, i + 658));
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
//        + sep 
        + '{|}'
        + '{yellow-fg}' + data.status + '{/yellow-fg}'
        + sep 
//        + '{|}'
        + '{green-fg}' + data.game + '{/green-fg}';
    });
    list.setItems(listItems);
    screen.render();
  });
}

//(function next() {
//  return refresh(function(err) {
//    return setTimeout(next, 60 * 1000);
//  });
//})();

(function next() {
  refresh();
  return setTimeout(next, 60 * 1000);
})();

var list = blessed.list({
  parent: screen,
//  label: 'Streams',
  align: 'left',
  mouse: true,
  //fg: 'blue',
  //bg: 'default',
//  border: {
//    type: 'line',
//    fg: 'default',
//    bg: 'default'
//  },
//  width: '50%',
//  height: '50%',
//  top: 'center',
//  left: 'center',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  //selectedBg: 'green',
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
  var args = ['--player', 'mpv', url, 'best']
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
//  list.setItems(['Loading...']);
//  screen.render();
  refresh();
});
