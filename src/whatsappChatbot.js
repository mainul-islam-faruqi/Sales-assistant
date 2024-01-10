const config = require("../config/config.js");

// Retrieval
// const { RetrievalQAChain } = require("langchain/chains");
// const langchain = require("langchain")
const { ChatOpenAI } = require("langchain/chat_models/openai");

const { BufferMemory, BufferWindowMemory } = require("langchain/memory");
const { PromptTemplate } = require("langchain/prompts");
const { RunnableSequence } = require("langchain/schema/runnable");
const { StringOutputParser } = require("langchain/schema/output_parser");
const { LLMChain } = require("langchain/chains");
const { formatDocumentsAsString } = require("langchain/util/document");
const { RunnableBranch } = require("langchain/schema/runnable");
const { BaseOutputParser } = require("langchain/schema/output_parser");
const { pull } = require("langchain/hub");
const { MultiQueryRetriever } = require("langchain/retrievers/multi_query");
const { Client } = "langsmith";
const { LangChainTracer } = "langchain/callbacks";
const loadPineconeDB = require("./pinecone.js")
const memory = require('./memoryChatHistory.js');


module.exports = async (message, prescription=false) => {
  
  console.log('message', message)
  try {
  
    const model = new ChatOpenAI({
      openAIApiKey: config.OPENAI_API_KEY,
      model: 'gpt-3.5-turbo',
      temperature: 0
    });
    

    // const client = new Client({
    //   apiUrl: "https://api.smith.langchain.com",
    //   apiKey: config.LANGCHAIN_API_KEY
    // });

    // const tracer = new LangChainTracer({
    //   projectName: "default",
    //   client
    // });

    // await model.invoke("Hello, world!", { callbacks: [tracer] })

    const vectorStore = await loadPineconeDB()

    const retriever = vectorStore.asRetriever({
      searchType: "mmr", // Use max marginal relevance search
      k: 200,
      // fetchK: 10,
    });

    if (prescription) {
      // Extract medicine list from the question
      const medicineListRegex = /\d+\.\s([^\n]+)/g;
      const medicineMatches = message.match(medicineListRegex);
      const medicineList = medicineMatches ? medicineMatches.map(match => match.replace(/^\d+\.\s/, '')) : [];
            
      // console.log(medicineList)

      // Create a prompt for each medicine
      const promptsForMedicine = medicineList.map((medicine, index) => `
      Medicine ${index + 1} Query:
      The user is inquiring about the availability of ${medicine} in the pharmacy. Provide relevant information and respond appropriately.
      `);

      var multiQueryPrompt = PromptTemplate.fromTemplate(`
      You are an AI language model assistant. Your task is to generate {queryCount} question for each medication of the given user question to retrieve relevant documents from a vector database. By generating multiple medication queries on the user question, your goal is to help the user overcome some of the limitations of distance-based similarity search.

      Original question: {question}
      `)
      
    }
    class LineListOutputParser extends BaseOutputParser {
      static lc_name() {
        return "LineListOutputParser";
      }
    
      lc_namespace = ["langchain", "retrievers", "multiquery"];
    
      async parse(text) {
        const startKeyIndex = text.indexOf("<questions>");
        const endKeyIndex = text.indexOf("</questions>");
        const questionsStartIndex =
          startKeyIndex === -1 ? 0 : startKeyIndex + "<questions>".length;
        const questionsEndIndex = endKeyIndex === -1 ? text.length : endKeyIndex;
        const lines = text
          .slice(questionsStartIndex, questionsEndIndex)
          .trim()
          .split("\n")
          .filter((line) => line.trim() !== "");
        return { lines };
      }
    
      getFormatInstructions() {
        throw new Error("Not implemented.");
      }
    }

    const prompt = await pull(
      "jacob/multi-query-retriever"
    );

        
    const llmChain = new LLMChain({
      llm: model,
      prompt,
      outputParser: new LineListOutputParser(),
    });
    const multiQueryRetriever = new MultiQueryRetriever({
      retriever: vectorStore.asRetriever(),
      llmChain,
      // verbose: true,
    });

    const serializeChatHistory = (chatHistory) => {
      if (Array.isArray(chatHistory)) {
        return chatHistory.join("\n");
      }
      return chatHistory;
    };

    /* Initialize our BufferMemory store */
    // const memory = new BufferWindowMemory({
    //   memoryKey: "chatHistory",
    //   k: 2
    // });
    
    const memoryResult = await memory.loadMemoryVariables({})
    //Portuquese is the primary language for question and answer.
    // Question will include prescriptions image which is converted into text, medicine name queries, selecting the medicine for order, health related question.
    const questionPrompt = PromptTemplate.fromTemplate(
      `Answer should be in English language. 
        You are a OrderTakingBot, an automated service to collect orders for a Pharmacy.
        You first greet the customer, then perform following CONDITIONS and look at the CHAT HISTORY and CONTEXT to answer.
        You will be provided with Portuguese medications, there will have a list of medicine with the details of DCI/Nome, dosagem, Forma Farmaceutica or Quant (meaning units in a box or volume).

        Identify a list of medications from the following QUESTION, and then Cross-reference to the CONTEXT and then list all the available and most similar medicines into the following OUTPUT on the Answer.

        If medication details of the QUESTION are unclear, request clear information from the user.
        
        CONDITIONS:
          1. For general health questions, or no medicine name found in the QUESTION:
            - Respond in the language of the question.
            - Provide information and guidance to the best of your knowledge, clearly stating that you are an OrderTakingBot AI assistant.
            - Make sure to ask the user relevant follow up questions.
          2. Taking Orders for Medication requested in the QUESTION, check CONTEXT, CHAT HISTORY:
            - Identify the medication requested in the QUESTION: DCI/Name, Dosagem, Embalagem.
            - And then compare that idenfication with the "DCI" and "Nome do medicamento" key/property of the CONTEXT.
            - If you find several options of dosage matching what the user asked, ask the user what is the pretended dosage stating what are the different dosages available according to what you found.
            - If you find several options of laboratories matching what the user asked, ask the user what is the pretended laboratories stating what are the different laboratories available according to what you found.
            - If details like dosage or quantity are unclear in the QUESTION and you find several medication that could match the request ask what is the laboratory and quantity the user wants.
            - If details like dosage or quantity are clear in the QUESTION, offering the available and 100% similar medicine option only from the CONTEXT with the following OUTPUT format.
            - When multiple options exist without clear medicine specification, provide choices for clarification meaning dosagem and Quant.

            OUTPUT the following format if medication name queries for order only:
              (1,2,...,N). <The exact value of "Nome do medicamento" column in the CONTEXT should be used for the medicine name query>
                - Dosage: <The dosage information can be found in the "Nome do medicamento" column, listed after the name of the drug.>
                - Forma Farmaceutica: <"Forma Farmaceutica" property in the context>
                - Laboratory: <The Laboratory information can be located in the "Laboratório" column or "Nome do medicamento" column, listed after the name of the drug.>
                - Price: <The price can be found in the "Preco" column in Euro.>
                - Package size: <The package size can be located in the "Nome do medicamento" column, listed after the drug's name and dosage.
                Alternatively, it may also be found in the "Quantity" column, or if the drug is liquid it can be found in "Volume (ml)".>
          
          3. If user select or choose medicine from your listing for Order, you get your medicine listing at the CHAT HISTORY:
            - asks if it's a pickup or delivery. \
            - If it's a delivery, you ask for an address. \
            - You wait to collect the entire order, if the customer wants to add anything else. \
            - If customer add any other medicine, identify the medicine item from the CONTEXT, and list medication option with OUTPUT format.\
            - then summarize it to make sure to clarify all options, such as: Package size/Quantity/Volume and Laboratório to uniquely, calculate price accurately, and then ask user to check for a final time to say "Yes". \
            - Finally you collect the payment.\
        
        Use the following pieces of CONTEXT to answer the question at the end. You respond in a short, very conversational friendly style. \

        ----------------
        CHAT HISTORY: {chatHistory}
        ----------------
        CONTEXT: {context}
        ----------------
        QUESTION: {question}
        ----------------
        Helpful Answer:
      `
    );
    // 4. If you don't know the answer, just say that you don't know, don't try to make up an answer:
    // I'm sorry, but I couldn't find the medicine you're asking about in the database. Could you please check the spelling or provide more details? Alternatively, you may ask questions that are not strictly health-related, I'm here to help with a variety of topics.
  
    //- If medicine name with Dosage or Quantity is in the QUESTION, list exact medicine details only with the following output format, don't list the similar medicine details in this case. \

    // - Provide dosage, quantity, laboratory, and price details found in our database for each medication.
    // 1. For prescription images:
    // - Infer the medication the user wants.
    // - Cross-reference it with the "Nome do medicamento" column in the excel file.
    // - Present and list only the medications with a quantity equal to or larger than what's in the prescription.

    //Next, you will compare {question} with the Nome do medicamento column in the excel. Present and only list the medication that has a quantity equal or larger than what's in the {question}. you can compare the dosage: (num mg/ml), or quantity: (X number)with the Nome do medicamento column

    // When in the {question} doesn't have dosage: (num mg/ml), or quantity: (number) or laboratory. Provide all the list of the medication of the excel what are the similar in the {question}. Response format is: To create a new line using key value pair for each of their respective dosage, quantities, laboratory, and price found in our database.

    //  and you find different quantity options for the asked medication that will have in the last of Nome do medicamento column. Tasks: list all different medications of different quantities, preco that you found in the excel. Response format is: To create a new line using key value pair for each of these dosage, quantities, laboratory, and price.

    // When the user doesn't specifiy the quantities and you find several options for the asked  medication that have different quantities you should ask what is the quantity the user pretends and list the options.

    // When the user doesn't specify the laboratory and you find several options for the asked medication that have different laboratories you should ask what is the laboratory the user pretends and list the options.
    

    // - user can select, buy, order from the options of previous chat
        
    //     - Remember your answer with medicines details, then user will select medicine from your answer
    //     - Remember all selected medicine details which are selected by user after your medicine listing for order
    
    const questionGeneratorTemplate =
      PromptTemplate.fromTemplate(
        `
        If medication exist, don't change FOLLOWUP QUESTION. 

        If you get anything related to medications, don't change the medication details and follow up question.
        If you get any "order related follow up question" includig these words: order, select, need, buy, option or any other words related to ordering medications, check CHAT HISTORY for getting selected medication options by user. And then add the medication on the follow up question to place order.

        Given FOLLOWUP QUESTION is mainly about placing order medications, giving prescription which is parsed into text, giving delivery address, payment query, etc.
        
        Given the CHAT HISTORY and a FOLLOWUP QUESTION, Perform the above condition to update the follow up question to be a standalone question as a customer's perspective for placing order on the Pharmacy to look at the chatHistory.
        ----------------
        CHAT HISTORY: {chatHistory}
        ----------------
        FOLLOWUP QUESTION: {question}
        ----------------
        Standalone question:`
      );
    
      // rephrase the follow up question to be a standalone question. 

    const handleProcessQuery = async input => {
      const chain = new LLMChain({
        llm: model,
        prompt: questionPrompt,
        outputParser: new StringOutputParser()
      })

      console.log('handleProcessQuery + input' ,input)
      const { text } = await chain.call({
        ...input,
        chatHistory: serializeChatHistory(input.chatHistory ?? "")
      })
      
      await memory.saveContext(
        {
          human: input.question,
        },
        {
          ai: text
        }
      )

      return text
    }

    const answerQuestionChain = RunnableSequence.from([
      {
        question: input => input.question
      },
      {
        question: previousStepResult => previousStepResult.question,
        chatHistory: previousStepResult => {
          console.log('previousStepResult', previousStepResult)
          return serializeChatHistory(memoryResult.chatHistory ?? "")
        },
        context: async previousStepResult => {
          // Fetch relevant docs and serialize to a string.
          // const test = await vectorStore.similaritySearch(previousStepResult.question)
          // console.log("test >>>>>>>>>", test)
          if (prescription) {
            const medicineListRegex = /\d+\.\s([^\n]+)/g;
            const medicineMatches = message.match(medicineListRegex);
            const medicineList = medicineMatches ? medicineMatches.map(match => match.replace(/^\d+\.\s/, '')) : [];
                  

      
            // Create a prompt for each medicine
            const promptsForMedicine = medicineList.map((medicine, index) => `
            Medicine ${index + 1} Query:
            The user is inquiring about the availability of ${medicine} in the pharmacy. Provide relevant information and respond appropriately.
            `);
            // console.log(`${promptsForMedicine.join('\n')}`)
            const relevantDocs = await multiQueryRetriever.getRelevantDocuments(
              previousStepResult.question,
            )
            const serialized = formatDocumentsAsString(relevantDocs)
            // console.log(relevantDocs)
            console.log(relevantDocs.length);
            return serialized
          } else {
            const relevantDocs = await retriever.getRelevantDocuments(
              previousStepResult.question
            )
            /* Search the vector DB independently with meta filters */
            // const relevantDocs = await vectorStore.maxMarginalRelevanceSearch(previousStepResult.question, {
            //   k: 250,
            //   //fetchK: 1, // Default value for the number of initial documents to fetch for reranking.
            //   // You can pass a filter as well
            //   // filter: {},
            // });
            const serialized = formatDocumentsAsString(relevantDocs)
            // console.log(relevantDocs)
            console.log(relevantDocs.length);
            return serialized
          }
          
          
          
        }
      },
      handleProcessQuery
    ])


    const generateQuestionChain = RunnableSequence.from([
      {
        question: input => input.question,
        chatHistory: async () => {
          
          
          return serializeChatHistory(memoryResult.chatHistory ?? "")
        }
      },
      questionGeneratorTemplate,
      model,
      // Take the result of the above model call, and pass it through to the
      // next RunnableSequence chain which will answer the question
      {
        question: previousStepResult => previousStepResult.text
      },
      answerQuestionChain
    ])
    

    const branch = RunnableBranch.from([
      [
        async () => {
          
          
          const isChatHistoryPresent = !memoryResult.chatHistory.length;
          console.log('isChatHistoryPresent', isChatHistoryPresent)
          return isChatHistoryPresent;
        },
        answerQuestionChain,
      ],
      [
        async () => {
          
         
          const isChatHistoryPresent =
            !!memoryResult.chatHistory && memoryResult.chatHistory.length;
          console.log('isChatHistoryPresent', isChatHistoryPresent)
      
          return isChatHistoryPresent;
        },
        generateQuestionChain,
      ],
      answerQuestionChain,
    ]);

   
    /* Define our chain which calls the branch with our input. */
    const fullChain = RunnableSequence.from([
      {
        question: (input) => input.question,
      },
      branch,
    ]);

    /* Invoke our `Runnable` with the first question */

    const resultOne = await fullChain.invoke({
      question: message, 
    });

    return resultOne;
  } catch (error) {
    console.error(error);
    return {
      message: "Something went wrong",
      error: error
    };
  }
};
