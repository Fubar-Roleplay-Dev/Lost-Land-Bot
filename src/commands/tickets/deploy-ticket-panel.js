const {
  ApplicationCommandOptionType, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { colorResolver } = require('../../util');
const { ticketPanelOption, ticketPanelOptionName } = require('../../interactions/autocomplete/ticket-panel');
const logger = require('@mirasaki/logger');
const ticketPanels = require('../../../config/tickets');

const createRowLayout = (inputArray) => {
  let newArray = []; // Temporary array to store elements before forming groups
  let trueCount = 0; // Keeps track of consecutive occurrences of 'true'
  const resultArrays = []; // Final array to store arrays after grouping

  for (let i = 0; i < inputArray.length; i++) {
    const arrEl = inputArray[i]; // Current element in the inputArray

    // Check if the current element is not null
    if (arrEl !== null) {
      trueCount++; // Increment the count of consecutive 'true' values

      // Check if the current element is an object and not an array, then add the 'index' property
      // This represents the index of this element in the inputArray
      if (typeof arrEl === 'object' && !Array.isArray(arrEl)) {
        arrEl.index = i;
      }

      // Add the current element to the temporary newArray
      newArray.push(arrEl);

      // Check if we have encountered five consecutive non-null 'true' values
      if (trueCount === 5) {
        resultArrays.push(newArray); // Add the newArray (group of five elements) to the resultArrays
        newArray = []; // Reset the newArray to start collecting elements for the next group
        trueCount = 0; // Reset the trueCount for the next group
      }
    }
    else if (newArray.length > 0) {
      // If the current element is null and the newArray is not empty,
      // it means we need to finalize the current group and add it to the resultArrays
      resultArrays.push(newArray); // Add the newArray to the resultArrays
      newArray = []; // Reset the newArray to start collecting elements for the next group
      trueCount = 0; // Reset the trueCount for the next group
    }
  }

  // Add any remaining items in the newArray to the resultArrays
  if (newArray.length > 0) {
    resultArrays.push(newArray);
  }

  return resultArrays; // Return the final resultArrays containing grouped elements
};

module.exports = new ChatInputCommand({
  global: true,
  permLevel: 'Administrator',
  data: {
    description: 'Deploy a ticket panel to the selected channel',
    options: [
      ticketPanelOption,
      {
        name: 'channel',
        description: 'The channel to deploy the ticket panel to',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ ChannelType.GuildText ],
        required: true
      }
    ]
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    const {
      guild, member, options
    } = interaction;
    const { emojis } = client.container;
    const channel = options.getChannel('channel');
    const panelInd = options.getString(ticketPanelOptionName);
    const ticketPanel = ticketPanels.at(panelInd);
    if (!ticketPanel) {
      interaction.reply(`${ emojis.error } ${ member }, I can't resolve the ticket panel for provided name, please select a panel from the autocomplete menu - this command has been cancelled`);
      return;
    }

    // Defer our reply
    await interaction.deferReply({ ephemeral: true });

    // Construct button rows
    const rows = [];
    const { actions } = ticketPanel;
    const rowLayout = createRowLayout(actions).filter((e) => e.length >= 1);
    rowLayout.forEach((row) => {
      const rowComponent = new ActionRowBuilder().addComponents(
        ...row.map((action) => {
          const {
            index, // Added by rowLayout
            buttonText,
            buttonColor,
            buttonEmoji
          } = action;
          const button = new ButtonBuilder()
            .setCustomId(`@ticket-action@${ ticketPanels.indexOf(ticketPanel) }@${ index }`)
            // https://discord.com/developers/docs/interactions/message-components#button-object-button-styles
            .setStyle(
              buttonColor === 'plurple'
                ? ButtonStyle.Primary
                : buttonColor === 'green'
                  ? ButtonStyle.Success
                  : buttonColor === 'grey'
                    ? ButtonStyle.Secondary
                    : buttonColor === 'red'
                      ? ButtonStyle.Danger
                      : ButtonStyle.Primary
            );
          const buttonName = `${ buttonEmoji ?? '' }${
            buttonText ? `${ buttonEmoji ? ' ' : '' }${ buttonText }` : ''
          }`.trim();
          button.setLabel(buttonName);
          return button;
        })
      );
      rows.push(rowComponent);
    });

    // Construct embed
    const embed = new EmbedBuilder({
      color: colorResolver(ticketPanel.embed.color),
      title: ticketPanel.embed.title ?? ticketPanel.identifier,
      description: ticketPanel.embed.description ?? 'Create a ticket by selecting one op the options below',
      thumbnail: { url: ticketPanel.embed.thumbnailURL ?? guild.iconURL({ dynamic: true }) }
    });

    // Optional fields
    if (
      ticketPanel.embed.imageURL
      && (process.env.NODE_ENV !== 'production' || !ticketPanel.embed.imageURL.startsWith('https://mirasaki.dev'))
    ) embed.setImage(ticketPanel.embed.imageURL);
    if (ticketPanel.embed.embedURL) embed.setURL(ticketPanel.embed.embedURL);
    if (ticketPanel.embed.footer) embed.setFooter({
      text: ticketPanel.embed.footer.text,
      iconURL: ticketPanel.embed.footer.iconURL
    });
    if (ticketPanel.embed.author) embed.setAuthor({
      name: ticketPanel.embed.author.name,
      url: ticketPanel.embed.author.url,
      iconURL: ticketPanel.embed.author.iconURL
    });

    // Try to post message, catch
    try {
      await channel.send({
        embeds: [ embed ],
        components: rows
          .filter((e) => e && e.components[0]) // truthy first value
          .slice(0, 5) // 5 max
      });
    }
    catch (err) {
      logger.syserr('Error encountered while deploying ticket panel:');
      console.error(err);
      interaction.editReply(`${ emojis.error } ${ member }, couldn't post ticket menu in channel: ${ err.message }`);
      return;
    }

    // Ok, user feedback
    await interaction.editReply(`${ emojis.success } ${ member }, ticket panel posted to ${ channel }`);
  }
});
