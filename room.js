// Generated by CoffeeScript 1.6.3
(function() {
  var Deck, Match, Room, User, bunyan, log, mongoose, settings, spawn, ygopro, _;

  _ = require('underscore');

  _.str = require('underscore.string');

  _.mixin(_.str.exports());

  spawn = require('child_process').spawn;

  ygopro = require('./ygopro.js');

  bunyan = require('bunyan');

  settings = require('./config.json');

  log = bunyan.createLogger({
    name: "mycard-room"
  });

  if (settings.modules.database) {
    mongoose = require('mongoose');
    mongoose.connect(settings.modules.database);
    User = require('./user.js');
    Deck = require('./deck.js');
    Match = require('./match.js');
  }

  Room = (function() {
    Room.all = [];

    Room.find_or_create_by_name = function(name) {
      var _ref;
      return (_ref = this.find_by_name(name)) != null ? _ref : new Room(name);
    };

    Room.find_by_name = function(name) {
      var result;
      result = _.find(this.all, function(room) {
        return room.name === name;
      });
      log.info('find_by_name', name, result);
      return result;
    };

    Room.find_by_port = function(port) {
      return _.find(this.all, function(room) {
        return room.port === port;
      });
    };

    Room.validate = function(name) {
      var client_name, client_name_and_pass, client_pass;
      client_name_and_pass = name.split('$', 2);
      client_name = client_name_and_pass[0];
      client_pass = client_name_and_pass[1];
      return !_.find(Room.all, function(room) {
        var room_name, room_name_and_pass, room_pass;
        room_name_and_pass = room.name.split('$', 2);
        room_name = room_name_and_pass[0];
        room_pass = room_name_and_pass[1];
        return client_name === room_name && client_pass !== room_pass;
      });
    };

    function Room(name) {
      var param,
        _this = this;
      this.name = name;
      this.alive = true;
      this.players = [];
      this.status = 'starting';
      this.established = false;
      this.watcher_buffers = [];
      this.watchers = [];
      Room.all.push(this);
      if (name.slice(0, 2) === 'M#') {
        param = [0, 0, 0, 1, 'F', 'F', 'F', 8000, 5, 1];
      } else if (name.slice(0, 2) === 'T#') {
        param = [0, 0, 0, 2, 'F', 'F', 'F', 8000, 5, 1];
      } else if ((param = name.match(/^(\d)(\d)(T|F)(T|F)(T|F)(\d+),(\d+),(\d+)/i))) {
        param.shift();
        param.unshift(0, 0);
      } else {
        param = [0, 0, 0, 0, 'F', 'F', 'F', 8000, 5, 1];
      }
      this.process = spawn('./ygopro', param, {
        cwd: 'ygocore'
      });
      this.process.on('exit', function(code) {
        log.info('room-exit', _this.name, _this.port, code);
        if (!_this.disconnector) {
          _this.disconnector = 'server';
        }
        return _this["delete"]();
      });
      this.process.stdout.setEncoding('utf8');
      this.process.stdout.once('data', function(data) {
        _this.established = true;
        _this.port = parseInt(data);
        return _.each(_this.players, function(player) {
          return player.server.connect(_this.port, '127.0.0.1', function() {
            var buffer, _i, _len, _ref;
            _ref = player.pre_establish_buffers;
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
              buffer = _ref[_i];
              player.server.write(buffer);
            }
            return player.established = true;
          });
        });
      });
    }

    Room.prototype["delete"] = function() {
      var index;
      if (this.deleted) {
        return;
      }
      if (_.startsWith(this.name, 'M#') && this.started && settings.modules.database) {
        this.save_match();
      }
      index = _.indexOf(Room.all, this);
      if (index !== -1) {
        Room.all.splice(index, 1);
      }
      return this.deleted = true;
    };

    Room.prototype.toString = function() {
      var player, _ref, _ref1;
      return "room: " + this.name + " " + this.port + " " + ((_ref = this.alive) != null ? _ref : {
        'alive': 'not-alive'
      }) + " " + ((_ref1 = this.dueling) != null ? _ref1 : {
        'dueling': 'not-dueling'
      }) + " [" + ((function() {
        var _i, _len, _ref2, _results;
        _ref2 = this.players;
        _results = [];
        for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
          player = _ref2[_i];
          _results.push("client " + (typeof player.client) + " server " + (typeof player.server) + " " + player.name + " " + player.pos + ". ");
        }
        return _results;
      }).call(this)) + "] " + (JSON.stringify(this.pos_name));
    };

    Room.prototype.ensure_finish = function() {
      var duel, normal_ended, player_wins, _i, _len, _ref;
      player_wins = [0, 0, 0];
      _ref = this.duels;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        duel = _ref[_i];
        player_wins[duel.winner] += 1;
      }
      normal_ended = player_wins[0] >= 2 || player_wins[1] >= 2;
      if (!normal_ended) {
        if (this.disconnector === 'server') {
          return false;
        }
        if (this.duels.length === 0 || _.last(this.duels).reason !== 4) {
          this.duels.push({
            winner: 1 - this.disconnector.pos,
            reason: 4
          });
        }
      }
      return true;
    };

    Room.prototype.save_match = function() {
      var match_winner,
        _this = this;
      if (!this.ensure_finish()) {
        return;
      }
      match_winner = _.last(this.duels).winner;
      return User.findOne({
        name: this.dueling_players[0].name
      }, function(err, player0) {
        if (err) {
          return log.error("error when find user", _this.dueling_players[0].name, err);
        } else if (!player0) {
          return log.error("can't find user ", _this.dueling_players[0].name);
        } else {
          return User.findOne({
            name: _this.dueling_players[1].name
          }, function(err, player1) {
            var loser, winner;
            if (err) {
              return log.error("error when find user", _this.dueling_players[1].name, err);
            } else if (!player1) {
              return log.error("can't find user ", _this.dueling_players[1].name);
            } else {
              log.info({
                user: player0._id,
                card_usages: _this.dueling_players[0].deck
              });
              Deck.findOne({
                user: player0._id,
                card_usages: _this.dueling_players[0].deck
              }, function(err, deck0) {
                if (err) {
                  log.error("error when find deck");
                } else if (!deck0) {
                  deck0 = new Deck({
                    name: 'match',
                    user: player0._id,
                    card_usages: _this.dueling_players[0].deck,
                    used_count: 1,
                    last_used_at: Date.now()
                  });
                  deck0.save();
                } else {
                  deck0.used_count++;
                  deck0.last_used_at = Date.now();
                  deck0.save();
                }
                log.info(deck0);
                log.info(_this.dueling_players[0].deck, _this.dueling_players[1].deck, _this.dueling_players);
                return Deck.findOne({
                  user: player1._id,
                  card_usages: _this.dueling_players[1].deck
                }, function(err, deck1) {
                  if (err) {
                    log.error("error when find deck");
                  } else if (!deck1) {
                    deck1 = new Deck({
                      name: 'match',
                      user: player1._id,
                      card_usages: _this.dueling_players[1].deck,
                      used_count: 1,
                      last_used_at: Date.now()
                    });
                    deck1.save();
                  } else {
                    deck1.used_count++;
                    deck1.last_used_at = Date.now();
                    deck1.save();
                  }
                  log.info(deck1);
                  return Match.create({
                    players: [
                      {
                        user: player0._id,
                        deck: deck0._id
                      }, {
                        user: player1._id,
                        deck: deck1._id
                      }
                    ],
                    duels: _this.duels,
                    winner: match_winner === 0 ? player0._id : player1._id,
                    ygopro_version: settings.version
                  }, function(err, match) {
                    return log.info(err, match);
                  });
                });
              });
              if (match_winner === 0) {
                winner = player0;
                loser = player1;
              } else {
                winner = player1;
                loser = player0;
              }
              log.info('before_settle_result', winner.name, winner.points, loser.name, loser.points);
              winner.points += 5;
              if (_.last(_this.duels).reason === 4) {
                loser.points -= 8;
              } else {
                loser.points -= 3;
              }
              log.info('duel_settle_result', winner.name, winner.points, loser.name, loser.points);
              winner.save();
              return loser.save();
            }
          });
        }
      });
    };

    Room.prototype.connect = function(client) {
      this.players.push(client);
      if (this.established) {
        return client.server.connect(this.port, '127.0.0.1', function() {
          var buffer, _i, _len, _ref;
          _ref = client.pre_establish_buffers;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            buffer = _ref[_i];
            client.server.write(buffer);
          }
          return client.established = true;
        });
      }
    };

    Room.prototype.disconnect = function(client, error) {
      var index;
      if (client.is_post_watcher) {
        ygopro.stoc_send_chat_to_room(this, "" + client.name + " " + '退出了观战' + (error ? ": " + error : ''));
        index = _.indexOf(this.watchers, client);
        if (index !== -1) {
          return this.watchers.splice(index, 1);
        }
      } else {
        index = _.indexOf(this.players, client);
        if (index !== -1) {
          this.players.splice(index, 1);
        }
        if (this.players.length) {
          return ygopro.stoc_send_chat_to_room(this, "" + client.name + " " + '离开了游戏' + (error ? ": " + error : ''));
        } else {
          this.process.kill();
          return this["delete"]();
        }
      }
    };

    return Room;

  })();

  module.exports = Room;

}).call(this);

/*
//@ sourceMappingURL=room.map
*/
