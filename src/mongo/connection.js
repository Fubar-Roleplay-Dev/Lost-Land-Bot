const logger = require('@mirasaki/logger');
const mongoose = require('mongoose');

const { MONGO_CONNECTION_URI } = process.env;

module.exports = async () => {
  try {
    await mongoose.connect(MONGO_CONNECTION_URI);
  }
  catch (err) {
    logger.syserr('Error encountered while connecting to Mongo database:');
    logger.printErr(err);
    logger.syserr('Exiting...');
    process.exit(1);
  }
};

mongoose.connection.once('open', () => {
  logger.success('Connected to MongoDB!');
});

mongoose.connection.on('error', console.error.bind(console, 'MongoDB Connection Error:'));

