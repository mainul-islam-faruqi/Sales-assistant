const { BufferWindowMemory } = require("langchain/memory");

module.exports = new BufferWindowMemory({ 
  memoryKey: "chatHistory", 
  k: 15,
} );
