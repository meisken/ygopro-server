// Generated by CoffeeScript 1.6.3
(function() {
  var Match, mongoose, settings;

  settings = require('./config.json');

  mongoose = require('mongoose');

  Match = mongoose.model('Match', {
    players: [
      {
        user: mongoose.Schema.ObjectId,
        deck: mongoose.Schema.ObjectId
      }
    ],
    duels: [
      {
        winner: Number,
        reason: Number
      }
    ],
    winner: mongoose.Schema.ObjectId,
    created_at: {
      type: Date,
      "default": Date.now
    },
    ygopro_version: Number
  });

  module.exports = Match;

}).call(this);

/*
//@ sourceMappingURL=match.map
*/
