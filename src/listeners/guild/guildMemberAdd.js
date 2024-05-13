const { EmbedBuilder } = require('discord.js');
const { clientConfig, replaceMessageTags } = require('../../util');
const logger = require('@mirasaki/logger');
const { welcome } = clientConfig;

module.exports = (client, member) => {
  const { guild } = member;

  const welcomeChannel = guild.channels.cache.get(welcome.channelId);
  if (!welcomeChannel) return;

  const welcomeMessage = replaceMessageTags(welcome.message, {
    user: member.user.username,
    '@user': `${ member }`,
    server: guild.name,
    memberCount: `${ guild.memberCount }`
  });
  const embed = new EmbedBuilder(welcome.embed);

  welcomeChannel.send({
    content: welcomeMessage,
    embeds: [ embed ]
  }, embed)
    .catch((err) => {
      logger.error(`Failed to send welcome message in ${ guild.name }`);
      logger.printErr(err);
    });
};
