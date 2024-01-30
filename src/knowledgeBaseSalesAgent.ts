const { ChatOpenAI } = require("langchain/openai");
const { RetrievalQAChain } = require("langchain/chains");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { HNSWLib } = require("langchain/vectorstores/hnswlib");
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { CharacterTextSplitter } = require("langchain/text_splitter");
const { ChainTool } = require("langchain/tools");
const url = require("url");
const path = require("path");

import {
  BasePromptTemplate,
  BaseStringPromptTemplate,
  SerializedBasePromptTemplate,
  StringPromptValue,
  renderTemplate,
} from "langchain/prompts";
import { AgentStep, InputValues, PartialValues } from "langchain/schema";
import { Tool } from "langchain/tools";


const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const retrievalLlm = new ChatOpenAI({ temperature: 0 });
const embeddings = new OpenAIEmbeddings();

export async function loadSalesDocVectorStore(FileName: string) {
  // your knowledge path
  const fullpath = path.resolve(__dirname, `./knowledge/${FileName}`);
  const loader = new TextLoader(fullpath);
  const docs = await loader.load();
  const splitter = new CharacterTextSplitter({
    chunkSize: 10,
    chunkOverlap: 0,
  });
  const new_docs = await splitter.splitDocuments(docs);
  return HNSWLib.fromDocuments(new_docs, embeddings);
}

export async function setup_knowledge_base(
  FileName: string,
  llm: BaseLanguageModel
) {
  const vectorStore = await loadSalesDocVectorStore(FileName);
  const knowledge_base = RetrievalQAChain.fromLLM(
    retrievalLlm,
    vectorStore.asRetriever()
  );
  return knowledge_base;
}

/*
 * query to get_tools can be used to be embedded and relevant tools found
 * we only use one tool for now, but this is highly extensible!
 */

export async function get_tools(product_catalog: string) {
  const chain = await setup_knowledge_base(product_catalog, retrievalLlm);
  const tools = [
    new ChainTool({
      name: "ProductSearch",
      description:
        "useful for when you need to answer questions about product information",
      chain,
    }),
  ];
  return tools;
}


/**
 * Define a Custom Prompt Template
 */


export class CustomPromptTemplateForTools extends BaseStringPromptTemplate {
  // The template to use
  template: string;
  // The list of tools available
  tools: Tool[];

  constructor(args: {
    tools: Tool[];
    inputVariables: string[];
    template: string;
  }) {
    super({ inputVariables: args.inputVariables });
    this.tools = args.tools;
    this.template = args.template;
  }

  format(input: InputValues): Promise<string> {
    // Get the intermediate steps (AgentAction, Observation tuples)
    // Format them in a particular way
    const intermediateSteps = input.intermediate_steps as AgentStep[];
    const agentScratchpad = intermediateSteps.reduce(
      (thoughts, { action, observation }) =>
        thoughts +
        [action.log, `\nObservation: ${observation}`, "Thought:"].join("\n"),
      ""
    );
    //Set the agent_scratchpad variable to that value
    input["agent_scratchpad"] = agentScratchpad;

    // Create a tools variable from the list of tools provided
    const toolStrings = this.tools
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join("\n");
    input["tools"] = toolStrings;
    // Create a list of tool names for the tools provided
    const toolNames = this.tools.map((tool) => tool.name).join("\n");
    input["tool_names"] = toolNames;
    // 构建新的输入
    const newInput = { ...input };
    /** Format the template. */
    return Promise.resolve(renderTemplate(this.template, "f-string", newInput));
  }
  partial(
    _values: PartialValues
  ): Promise<BasePromptTemplate<any, StringPromptValue, any>> {
    throw new Error("Method not implemented.");
  }

  _getPromptType(): string {
    return "custom_prompt_template_for_tools";
  }

  serialize(): SerializedBasePromptTemplate {
    throw new Error("Not implemented");
  }
}