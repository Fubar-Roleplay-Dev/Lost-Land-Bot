const { ChatInputCommand } = require('../../classes/Commands');
const {
  requiredServerConfigCommandOption,
  getServerConfigCommandOptionValue,
  rawRConCommand
} = require('../../modules/cftClient');

module.exports = new ChatInputCommand({
  permLevel: 'Administrator',
  global: true,
  data: {
    description: 'Restart the DayZ server',
    options: [ requiredServerConfigCommandOption ]
  },

  run: async (client, interaction) => {
    // Destructuring
    const { member } = interaction;
    const { emojis } = client.container;

    // Deferring our reply
    await interaction.deferReply();

    // Declaration
    const serverCfg = getServerConfigCommandOptionValue(interaction);
    const res = await rawRConCommand(serverCfg.CFTOOLS_SERVER_API_ID, '#restart');
    if (!res) {
      interaction.editReply({ content: `${ emojis.error } ${ member }, failed to execute the following raw RCon command:\n\`\`\`#restart\`\`\`\n\nCFTools response not 200/OK` });
      return;
    }

    // User feedback on success
    interaction.editReply({ content: `${ emojis.success } ${ member }, executed the following raw RCon command:\n\`\`\`#restart\`\`\`` });
  }
});
