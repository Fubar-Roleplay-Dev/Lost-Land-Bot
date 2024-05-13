const { Schema, model } = require('mongoose');

const itemPackageSchema = Schema({
  guildId: {
    type: String,
    required: true
  },
  packageId: {
    type: String,
    required: true
  },
  items: [
    {
      className: {
        type: String,
        required: true
      },
      quantity: {
        type: Number,
        required: true
      },
      stacked: {
        type: Boolean,
        required: false,
        default: false
      },
      debug: {
        type: Boolean,
        required: false,
        default: false
      }
    }
  ]
}, { timestamps: true });

module.exports.itemPackageSchema = itemPackageSchema;
const ItemPackageModel = model('itemPackages', itemPackageSchema);
module.exports.ItemPackageModel = ItemPackageModel;
