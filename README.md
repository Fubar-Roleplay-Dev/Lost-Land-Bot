# roofdoc-discord-bot

## 🔨 Installation

1. Download [Node](https://nodejs.org/en/download) - choose LTS, **not** Current
    - Be sure to check the box that says "Automatically install the necessary tools" when you're running the installation wizard
2. Set up your [CFTools Developer Application](https://wiki.mirasaki.dev/docs/cftools-create-application)
3. Set up your [Discord Developer Application](https://wiki.mirasaki.dev/docs/discord-create-application)
4. Download the latest release [here](https://github.com/Mirasaki-Development-Clients/roofdoc-discord-bot/releases)
5. Open the newly created folder (extract the compressed file if you've downloaded the latest release) in Windows Explorer if you're on Windows, or `cd cftools-discord-bot` into the folder otherwise
6. Open a new command prompt in the newly created folder/source files and run `npm install` to install all project dependencies
7. Go into the `/config` folder, and `Copy & Paste` all .example files and remove `.example` from the new names
    - `config.example.js` > copy paste > rename new file to `config.js`
    - `servers.example.js` > copy paste > rename new file to `servers.js`
    - `tickets.example.js` > copy paste > rename new file to `tickets.js`
    - `.env.example` > copy paste > rename new file to `.env`
8. Configure all the files
9. Use the `node .` command to start your application after configuring
