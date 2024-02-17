const config = require("../config/config.js");
const { BabyAGI } = require("langchain/experimental/babyagi");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { OpenAIEmbeddings, OpenAI } = require("@langchain/openai");
const { LLMChain } = require("langchain/chains");
const { ChainTool } = require("langchain/tools");
const { initializeAgentExecutorWithOptions } = require("langchain/agents");
const { PromptTemplate } = require("@langchain/core/prompts");
const { Tool } = require("@langchain/core/tools");

// First, we create a custom agent which will serve as execution chain.
module.exports = async (req, res) => {
  const todoPrompt = PromptTemplate.fromTemplate(
    "You are a planner who is an expert at coming up with a todo list for a given objective. Come up with a todo list for this objective: {objective}"
  );
  const tools = [
    // new SerpAPI(process.env.SERPAPI_API_KEY, {
    //   location: "San Francisco,California,United States",
    //   hl: "en",
    //   gl: "us",
    // }),
    new ChainTool({
      name: "TODO",
      chain: new LLMChain({
        llm: new OpenAI({ openAIApiKey: config.OPENAI_API_KEY, temperature: 0 }),
        prompt: todoPrompt,
      }),
      description:
        "useful for when you need to come up with todo lists. Input: an objective to create a todo list for. Output: a todo list for that objective. Please be very clear what the objective is!",
    }),
  ];
  const agentExecutor = await initializeAgentExecutorWithOptions(
    tools,
    new OpenAI({ openAIApiKey: config.OPENAI_API_KEY, temperature: 0 }),
    {
      agentType: "zero-shot-react-description",
      agentArgs: {
        prefix: "You are an AI who performs one task based on the following objective: {objective}. Take into account these previously completed tasks: {context}.",
        suffix: "Question: {task}\n{agent_scratchpad}",
        inputVariables: ["objective", "task", "context", "agent_scratchpad"],
      },
    }
  );
  
  const vectorStore = new MemoryVectorStore(new OpenAIEmbeddings());
  
  // Then, we create a BabyAGI instance.
  const babyAGI = BabyAGI.fromLLM({
    llm: new OpenAI({ openAIApiKey: config.OPENAI_API_KEY, temperature: 0 }),
    executionChain: agentExecutor, // an agent executor is a chain
    vectorstore: vectorStore,
    maxIterations: 10,
  });
  
  const response = await babyAGI.call({ objective: "Write a short weather report for SF today" });
  res.send(response)
}