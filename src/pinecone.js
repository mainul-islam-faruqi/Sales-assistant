const { Pinecone } = require("@pinecone-database/pinecone");
const { Document } = require("langchain/document");
const { DirectoryLoader } = require("langchain/document_loaders/fs/directory");
const { CSVLoader } = require("langchain/document_loaders/fs/csv");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { VectorDBQAChain } = require("langchain/chains");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { OpenAI } = require("langchain/llms/openai");
const { PineconeStore } = require("langchain/vectorstores/pinecone");
const config = require("../config/config.js");

let cachedData;
let isPineconeDB = false;

const pinecone = new Pinecone({ 
  apiKey: config.PINECONE_API,
  environment: config.PINECONE_ENV
});

const pineconeIndex = pinecone.Index(config.PINECONE_INDEX);



module.exports = async function loadPineconeDB() {
  // const des = await pinecone.describeCollection(config.PINECONE_INDEX);
  const pineconeStats = await pinecone.index('chatbot-index').describeIndexStats()
// console.log('pineconeStats', pineconeStats)
  if (!cachedData && pineconeStats.totalRecordCount !== 0) {
    isPineconeDB = true;
    try {
      console.log('no cached Data')
      cachedData = await PineconeStore.fromExistingIndex(
        new OpenAIEmbeddings(),
        { pineconeIndex }
      );
      // console.log('cachedData', cachedData)
      
    } catch (error) {
      
      console.log(error)
    }
    
  }
  
  if (!isPineconeDB && pineconeStats.totalRecordCount == 0) {
    console.log('no isPineconeDB', isPineconeDB)
    const loader = new DirectoryLoader("src/data", {
      ".csv": (path) => new CSVLoader(path),
      ".DS_Store": (path) => {},
    });

    const docs = await loader.load();
    // console.log(docs, 'docs')

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 150,
    });

    const splitDocs = await textSplitter.splitDocuments(docs);
    // console.log('splitDocs', splitDocs, "splitDocs")


    try {

      await PineconeStore.fromDocuments(splitDocs, new OpenAIEmbeddings(), {
        pineconeIndex,
        maxConcurrency: 5, // Maximum number of batch requests to allow at once. Each batch is 1000 vectors.
      });
  
      cachedData = await PineconeStore.fromExistingIndex(
        new OpenAIEmbeddings(),
        { pineconeIndex }
      );
      console.log('cachedData, no pinecone DB', cachedData)
      
    } catch (error) {
      console.error(error);
    }
    
  }
  
  return cachedData;
}