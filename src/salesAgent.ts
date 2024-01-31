import { PromptTemplate } from "langchain/prompts";
import { LLMChain } from "langchain/chains";
import { BaseLanguageModel } from "langchain/base_language";

// Chain to analyze which conversation stage should the conversation move into.
export function loadStageAnalyzerChain(
  llm: BaseLanguageModel,
  verbose: boolean = false
) {
  const prompt = new PromptTemplate({
    template: `Do not answer anything else nor add anything to you answer.`,
    inputVariables: ["conversation_history"],
  });
  return new LLMChain({ llm, prompt, verbose });
}

// Chain to generate the next utterance for the conversation.
export function loadSalesConversationChain(
  llm: BaseLanguageModel,
  verbose: boolean = false
) {
  const prompt = new PromptTemplate({
    template: `Never forget your name is {salesperson_name}. You work as a {salesperson_role}.`,
    inputVariables: [
      "salesperson_name",
      "salesperson_role",
      "company_name",
      "company_business",
      "company_values",
      "conversation_purpose",
      "conversation_type",
      "conversation_stage",
      "conversation_history",
    ],
  });
  return new LLMChain({ llm, prompt, verbose });
}
