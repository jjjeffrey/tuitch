#!/usr/bin/python2

"""
Twitch.tv TUI - uses urwid, twitch api, livestreamer, and mpv

Keys:
enter - connect
up/k, down/j - navigate list
r - reload list
q - quit

Todo:
i - irc
tab - switch between panes

Options:
 -o/--printmode - print out streams instead of menu
 -f/--fpath <filepath> - use different file for list of streams
 -q/--quality <quality> - use different quality than default
 -g/--geometry <geometry> - use different geometry than default
 -p/--player <player> - use different player than default
 -c/--cache <cache> - use different cache than default
"""

import urwid
import urllib2
import json
import os.path
import os
import pipes
import subprocess
import argparse

# Should create config file to hold options?
# Should find to use default video player? (How would you use player options?)
PLAYER = 'mpv'
FILEPATH = 'namelist'
QUALITY = 'best'
GEOMETRY = '640x360'
CACHE = '2048'
WRITEBACK = True
NAMELST = []

def get_list(filepath):
  global WRITEBACK
  namelst = []
  if os.path.isfile(filepath):
    f = open(filepath, 'r')
    for i in f:
      namelst.append(i.strip())
    f.close()
  namelst = list(set(namelst))
  for i in namelst:
    if i in ('', ' ', '\n', ' \n'):
      namelst.remove(i)
  namelst.sort()
  if WRITEBACK == True:
    writeback_sorted(filepath, namelst)
  return namelst

def writeback_sorted(filepath, namelst):
  if os.path.isfile(filepath):
    f = open(filepath, 'w')
    for i in namelst:
      f.write(i + '\n')
    f.close()

def get_choices(namelst):
  namestr = ''
  for i in namelst:
    namestr += str(i) + ','
  namestr = namestr.rstrip(',')
  offset = 0
  menulst = []
  while True:
    url = 'https://api.twitch.tv/kraken/streams?channel=' + namestr + \
          '&limit=100&offset=' + str(offset)
    response = urllib2.urlopen(url).read().decode('ascii', 'ignore')
    data = json.loads(response)
    for i in data['streams']:
      s = (str(i['channel']['name']) + ' - ' + \
           str(i['channel']['status']) + ' (' + \
           str(i['channel']['game']) + ') ' + \
           str(i['viewers']) + ' Viewers').strip().replace('\n', '')
      menulst.append(s)
# Checks to see if all possible streams have been collected already
# in this call that can only have a maximum of 659 names.
    if (len(data['streams']) < 100) or offset >= 600:
      break
    offset += 100
  menulst.sort()
  return menulst

# Twitch has a problem with making an API call with more than 659 names.
# So, to fix it, you segment it and call it in 659 name chunks.
def call_choices(namelst):
  menulst = []
  for i in range(0, len(namelst), 659):
    try:
      menulst += get_choices(namelst[i:i+658])
    except:
      menulst += ['Error occurred retrieving streams']
  return menulst

def print_list():
  global FILEPATH
  streamlst = call_choices(get_list(FILEPATH))
  for i in streamlst:
    print i
  print ''

class VimListBox(urwid.ListBox):
  def keypress(self, size, key):
    if key in ('j', 'J'):
      return self.keypress(size, "down")
    elif key in ('k', 'K'):
      return self.keypress(size, "up")
    else:
      return super(VimListBox, self).keypress(size, key)

def menu(title, choices):
  body = [urwid.Text(title), urwid.Divider()]
  for c in choices:
    button = urwid.Button(c)
    urwid.connect_signal(button, 'click', item_chosen, c)
    body.append(urwid.AttrMap(button, None, focus_map='reversed'))
  return VimListBox(urwid.SimpleFocusListWalker(body))

def item_chosen(button, choice):
  global PLAYER, GEOMETRY, CACHE, QUALITY
  url = "twitch.tv/" + choice.split()[0]
  with open(os.devnull, 'w') as DEVNULL:
    subprocess.Popen(["sh", "-c", "(setsid livestreamer " + \
                      "--player \'" + pipes.quote(PLAYER) + \
                      " -geometry " + pipes.quote(GEOMETRY) + \
                      " -cache " + pipes.quote(CACHE) + "\' " + \
                      pipes.quote(url) + " " + pipes.quote(QUALITY) + " &)"], \
                      stdout=DEVNULL, stderr=DEVNULL)

def exit_on_q(key):
  if key in ('q', 'Q'):
    raise urwid.ExitMainLoop

class MenuPadding(urwid.Padding):
  def keypress(self, size, key):
    global NAMELST
    if key in ('r', 'R'):
      choices = call_choices(NAMELST)
      main = menu('Streams', choices)
      self.original_widget = main
    else:
      return super(MenuPadding, self).keypress(size, key)

def create_menu():
  global NAMELST, FILEPATH
  NAMELST = get_list(FILEPATH)
  choices = call_choices(NAMELST)
  menu_widget = menu('Streams', choices)
  padding = MenuPadding(menu_widget)
  top = urwid.BoxAdapter(padding, 10)
  return top

def start_menu():
  global NAMELST, FILEPATH
  NAMELST = get_list(FILEPATH)
  choices = call_choices(NAMELST)
  menuwidget = MenuPadding(menu('Streams', choices))
  top = urwid.Overlay(menuwidget, urwid.SolidFill('\N{MEDIUM SHADE}'), \
                      align='left', width=('relative', 100), \
                      valign='top', height=('relative', 100))
#  palette = [('reversed','black','white')]
  palette = [('reversed','light gray','dark blue')]
  urwid.MainLoop(top, palette=palette, \
                 unhandled_input=exit_on_q).run()

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('-o', '--printmode', action='store_true')
  parser.add_argument('-f', '--fpath')
  parser.add_argument('-q', '--quality')
  parser.add_argument('-g', '--geometry')
  parser.add_argument('-p', '--player')
  parser.add_argument('-c', '--cache')
  args = parser.parse_args()
  if args.fpath != None:
    FILEPATH = pipes.quote(args.fpath)
  if args.quality != None:
    QUALITY = pipes.quote(args.quality)
  if args.geometry != None:
    GEOMETRY = pipes.quote(args.geometry)
  if args.player != None:
    PLAYER = pipes.quote(args.player)
  if args.cache != None:
    CACHE = pipes.quote(args.cache)
  if args.printmode == False:
    start_menu()
  else:
    print_list()
