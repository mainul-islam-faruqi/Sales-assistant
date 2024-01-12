const { DirectoryLoader } = require("langchain/document_loaders/fs/directory");
const { CSVLoader } = require("langchain/document_loaders/fs/csv");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { HNSWLib } = require("langchain/vectorstores/hnswlib");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");

let cachedData;

module.exports = async function loadDataIfNeeded() {
  if (!cachedData) {
    console.log('no cached Data')
    const loader = new DirectoryLoader("src/data", {
      ".csv": (path) => new CSVLoader(path),
      ".DS_Store": (path) => {},
    });

    const docs = await loader.load();
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 0,
    });

    const splitDocs = await textSplitter.splitDocuments(docs);
    cachedData = await HNSWLib.fromDocuments(splitDocs, new OpenAIEmbeddings());
  }

  console.log('cachedData', cachedData)
  
  return cachedData;
}