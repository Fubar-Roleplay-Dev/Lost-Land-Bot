const { Schema, model } = require('mongoose');

const ticketSchema = Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  panelIndex: {
    type: Number,
    required: true,
    index: true
  },
  actionIndex: {
    type: Number,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true,
    index: true
  },
  transcript: {
    type: Array,
    required: true,
    default: []
  },
  claimed: {
    type: Boolean,
    default: false
  },
  claimedBy: {
    type: String,
    default: null
  },
  closed: {
    type: Boolean,
    default: false
  },
  closedBy: {
    type: String,
    default: null
  },
  reason: {
    type: String,
    default: null
  },
  activeStaffIds: {
    type: Array,
    default: []
  },
  escalationLevel: {
    type: Number,
    default: 0
  },
  serverIdentifier: {
    type: String,
    default: null
  },
  index: {
    type: Number,
    required: true
  }
}, { timestamps: true });

module.exports.ticketSchema = ticketSchema;
const TicketModel = model('tickets', ticketSchema);
module.exports.TicketModel = TicketModel;
