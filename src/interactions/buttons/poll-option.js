const { ComponentCommand } = require('../../classes/Commands');
const { resolveButtonName, emojifyNumber } = require('../../util');
const { getGuildSettings, db } = require('../../modules/db');
const { EmbedBuilder } = require('discord.js');

module.exports = new ComponentCommand({ run: async (client, interaction) => {
  const {
    guild, member, customId, channel
  } = interaction;
  // Resolve and make sure we have an option
  const [
    , // void @
    , // void action
    pollIndexStr,
    optionIndStr
  ] = customId.split('@');
  const pollIndex = Number(pollIndexStr);
  const optionInd = Number(optionIndStr);

  // Make sure poll still exists
  const settings = getGuildSettings(guild.id);
  const poll = settings.polls.find((e) => e.index === pollIndex);
  if (!poll) {
    interaction.reply({
      content: 'This poll no longer exists - this action has been cancelled.',
      ephemeral: true
    });
    return;
  }

  const option = poll.options.at(optionInd);
  if (!option) {
    interaction.reply({
      content: 'This is not a valid poll option - this action has been cancelled. This might be a configuration update that wasn\'t deployed, please try again later or contact the server administrators',
      ephemeral: true
    });
    return;
  }

  // Make sure poll is still active
  if (new Date(poll.ends).valueOf() < Date.now()) {
    interaction.reply({
      content: 'This poll has ended - this action has been cancelled.',
      ephemeral: true
    });
    return;
  }

  // Defer our reply
  await interaction.deferReply({ ephemeral: true });

  // Feedback, already voted for this option
  const buttonName = resolveButtonName({ buttonText: `${ emojifyNumber(optionInd + 1) } ${ option }` });
  if (poll.votes[option].includes(member.id)) {
    interaction.editReply({
      content: `You already voted for option **${ buttonName }** - this action has been cancelled`,
      ephemeral: true
    });
    return;
  }


  // Lets remove all existing votes from this user
  let foundVoteInOptionName;
  Object.entries(poll.votes).forEach(([ optionName, votes ]) => {
    if (!votes.includes(member.id)) return;
    foundVoteInOptionName = optionName;
    poll.votes[optionName] = votes.filter((e) => e !== member.id);
  });

  // Then, lets add the new vote
  poll.votes[option].push(member.id);

  // Update settings
  const guilds = db.getCollection('guilds');
  guilds.update(settings);

  // Feedback!
  const found = foundVoteInOptionName
    ? resolveButtonName({ buttonText: `${ emojifyNumber(poll.options.indexOf(foundVoteInOptionName) + 1) } ${ foundVoteInOptionName }` })
    : null;
  interaction.editReply({
    content: found
      ? `Your changed your vote from **${ found }** to **${ buttonName }**`
      : `Your vote for option **${ buttonName }** has been submitted`,
    ephemeral: true
  });

  // Let's update the poll message
  const msg = await channel.messages.fetch(poll.messageId);
  const existingEmbed = new EmbedBuilder(msg.embeds[0]);
  const totalVotes = Object.values(poll.votes).reduce((a, b) => a + b.length, 0);
  existingEmbed.data.fields.forEach((e) => {
    if (e.name.startsWith('Total Votes')) {
      e.value = `${ totalVotes }`;
    }
  });
  msg.edit({ embeds: [ existingEmbed ] });
} });
