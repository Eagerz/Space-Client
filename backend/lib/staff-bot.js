/**
 * Compatibility facade — crash staff reports now live in discord-bot.
 * Prefer requiring `./discord-bot` for new code.
 */

"use strict";

const bot = require("./discord-bot");

module.exports = {
  startStaffBot: bot.startDiscordBot,
  stopStaffBot: bot.stopDiscordBot,
  reportCrash: bot.reportCrash,
  botEnabled: bot.botEnabled,
};
