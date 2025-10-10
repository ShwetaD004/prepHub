import { GoogleGenAI, Type } from "@google/genai";
import { AptitudeTopic, AptitudeSubTopics, TechnicalRole, MockInterviewRoundResult } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAptitudeQuestions = async (subTopics: string[], count: number, difficulty: string) => {
    // Create a reverse map to find the main topic for any given sub-topic
    const subTopicToTopicMap: Record<string, AptitudeTopic> = {};
    for (const topic in AptitudeSubTopics) {
        AptitudeSubTopics[topic as AptitudeTopic].forEach(sub => {
            if (sub !== 'All Topics') {
                subTopicToTopicMap[sub] = topic as AptitudeTopic;
            }
        });
    }

    // Determine the main topics based on the selected sub-topics
    const selectedMainTopics = new Set<AptitudeTopic>();
    subTopics.forEach(sub => {
        if (subTopicToTopicMap[sub]) {
            selectedMainTopics.add(subTopicToTopicMap[sub]);
        }
    });

    const mainTopicsArray = Array.from(selectedMainTopics);
    let mainTopicDescription: string;

    if (mainTopicsArray.length > 1) {
        mainTopicDescription = `a mix of topics from ${mainTopicsArray.join(', ')}`;
    } else if (mainTopicsArray.length === 1) {
        mainTopicDescription = `the topic of ${mainTopicsArray[0]}`;
    } else {
        mainTopicDescription = "a mix of general aptitude topics"; // Fallback
    }

    const subTopicFocus = `specifically focusing on the following concepts: ${subTopics.join(', ')}`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `URGENT: Your top priority is speed. Generate the response as fast as possible. Generate ${count} ${difficulty} level multiple-choice questions suitable for an engineering student's placement preparation. The questions should cover ${mainTopicDescription}, ${subTopicFocus}. For each question, provide: 1. The question text. 2. Four distinct options. 3. The correct answer text. 4. A detailed, step-by-step explanation for the solution, formatted in markdown and highlighting any key formulas used (e.g., by wrapping them in backticks like \`formula\`). 5. The specific sub-topic this question belongs to from the list provided (e.g., 'Percentage', 'Blood Relations').`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        question: { type: Type.STRING },
                        options: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        correctAnswer: { type: Type.STRING },
                        explanation: {
                            type: Type.STRING,
                            description: 'A detailed step-by-step explanation of the solution in markdown, including any formulas used.'
                        },
                        subTopic: {
                            type: Type.STRING,
                            description: 'The specific sub-topic the question belongs to.'
                        }
                    },
                    required: ["question", "options", "correctAnswer", "explanation", "subTopic"],
                }
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Failed to parse JSON from Gemini response:", response.text, error);
        throw new Error("Failed to generate aptitude questions. The AI response was not valid JSON.");
    }
};

export const generateImprovementSuggestions = async (analysis: {
    slowInaccurate: string[];
    fastInaccurate: string[];
    slowAccurate: string[];
}) => {
    const prompt = `
    You are an expert career coach providing feedback to a student who just finished an aptitude test.
    Based on their performance breakdown below, provide concise, encouraging, and actionable suggestions for improvement.
    Use markdown formatting (like bullet points) for clarity. Focus on the most critical areas first.

    **Performance Analysis:**
    - **Weaknesses (Slow & Inaccurate):** ${analysis.slowInaccurate.join(', ') || 'None'}
    - **Needs Caution (Fast & Inaccurate):** ${analysis.fastInaccurate.join(', ') || 'None'}
    - **Needs Speed (Slow & Accurate):** ${analysis.slowAccurate.join(', ') || 'None'}

    Please provide targeted advice for the top 2-3 areas they should focus on.
  `;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    return response.text;
};

export const extractTopicFromGoal = async (goalText: string): Promise<AptitudeTopic> => {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `From the user's goal, identify the main aptitude topic.
        User Goal: "${goalText}"
        The topic must be one of these exact values: '${Object.values(AptitudeTopic).join("', '")}'.
        If the topic is not clear or not in the list, default to '${AptitudeTopic.QUANTITATIVE}'.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING, enum: Object.values(AptitudeTopic) },
                },
                required: ["topic"],
            }
        }
    });
    try {
        const jsonText = JSON.parse(response.text.trim());
        return jsonText.topic;
    } catch (error) {
        console.error("Failed to parse topic from Gemini response:", response.text, error);
        return AptitudeTopic.QUANTITATIVE; // Fallback to avoid crashing
    }
};

export const parseUserGoal = async (
    goalText: string,
    currentAccuracy: number | null
): Promise<{ topic: AptitudeTopic, targetAccuracy: number, days: number }> => {
    const suggestionLogic = currentAccuracy !== null
        ? `The user's current average accuracy in the relevant topic is approximately ${currentAccuracy.toFixed(0)}%. If the user does not specify a target accuracy percentage in their goal, suggest a new target that is a challenging but achievable improvement. A good suggestion is usually 10-15% higher than their current accuracy, rounded to the nearest 5 (e.g., if current is 62%, suggest 75%). The suggested target should not exceed 95% unless explicitly stated by the user.`
        : `The user has no past performance data for this topic. If the user does not specify a target accuracy, suggest 80% as a solid starting point.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Parse the following user goal into a structured JSON object. The user wants to set a goal for their aptitude preparation.
        User Goal: "${goalText}"
        
        CONTEXT: ${suggestionLogic}
        
        Your task is to extract the aptitude topic, the target accuracy percentage, and the number of days to achieve the goal.
        - The topic MUST be one of the following exact strings: '${Object.values(AptitudeTopic).join("', '")}'. If not clear, default to '${AptitudeTopic.QUANTITATIVE}'.
        - Target accuracy MUST be a number between 50 and 100. Use the suggestion logic if the user doesn't specify one.
        - Days MUST be a number between 7 and 90. Default to 30 if not specified. Convert periods like '3 weeks' to days.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING, enum: Object.values(AptitudeTopic) },
                    targetAccuracy: { type: Type.NUMBER },
                    days: { type: Type.NUMBER },
                },
                required: ["topic", "targetAccuracy", "days"],
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Failed to parse goal from Gemini response:", response.text, error);
        throw new Error("Failed to parse user goal. The AI response was not valid JSON.");
    }
};

export interface InterviewConfig {
    role: string;
    experience: string;
    techStack: string[];
    jobDescription: string;
}

export const generateTechnicalQuestion = async (config: InterviewConfig) => {
    const { role, experience, techStack, jobDescription } = config;

    const prompt = `
    You are an expert technical interviewer conducting an interview. Your goal is to assess the candidate's skills accurately based on their profile.

    **Candidate Profile:**
    - **Target Role:** ${role}
    - **Experience Level:** ${experience}
    - **Key Technologies:** ${techStack.join(', ')}

    **Job Description (if provided):**
    ---
    ${jobDescription || 'N/A'}
    ---

    **Your Strict Constraints:**
    1.  Your questions MUST be highly relevant to the **Target Role**.
    2.  Approximately 80% of the questions you generate throughout this entire interview MUST specifically reference one or more technologies from the **Key Technologies** list.
    3.  If a **Job Description** is provided, you MUST prioritize generating questions that target keywords, requirements, and responsibilities mentioned in it.
    
    Generate the **first** technical interview question based on this profile. It should be an open-ended, foundational question that allows for deeper follow-ups.
    - **Style:** Phrase the question naturally and conversationally.
    - **Return ONLY the question text**, without any introductory phrases.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    return response.text;
};

// FIX: Add generateMultipleTechnicalQuestions for mock interviews.
export const generateMultipleTechnicalQuestions = async (config: InterviewConfig, count: number): Promise<string[]> => {
    const { role, experience, techStack, jobDescription } = config;

    const prompt = `
    URGENT: Your highest priority is speed. Generate the response as fast as possible. You are an expert interviewer preparing questions for a technical interview.

    **Candidate Profile:**
    - **Target Role:** ${role}
    - **Experience Level:** ${experience}
    - **Key Technologies:** ${techStack.join(', ')}
    - **Job Description Context:** ${jobDescription || 'N/A'}

    **Your Task:**
    Generate a list of ${count} distinct, open-ended technical interview questions suitable for this candidate. The questions should cover a range of relevant topics, from fundamentals to more advanced concepts, and should be phrased conversationally.

    Return the questions as a JSON object with a single key "questions" containing an array of strings.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ["questions"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.questions && Array.isArray(parsed.questions)) {
            return parsed.questions;
        }
        throw new Error("Invalid response format from AI.");
    } catch (error) {
        console.error("Failed to parse multiple technical questions from Gemini:", response.text, error);
        // Fallback to generating one question multiple times
        const questions: string[] = [];
        for (let i = 0; i < count; i++) {
            questions.push(await generateTechnicalQuestion(config));
        }
        return questions;
    }
};

export const getTechnicalFeedbackAndFollowUp = async (
    question: string,
    answer: string,
    chatHistory: { question: string, answer: string, feedback: string }[],
    config: InterviewConfig
): Promise<{ feedback: string, followUpQuestion: string }> => {
    const historyString = chatHistory.map(turn => `Interviewer: ${turn.question}\nCandidate: ${turn.answer}\nFeedback: ${turn.feedback}`).join('\n\n');

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          You are a friendly, senior engineering manager conducting a technical interview.
          The candidate is being interviewed for a ${config.role} role with ${config.experience} of experience, focusing on ${config.techStack.join(', ')}.
          
          This is the conversation so far:
          ---
          ${historyString}
          ---

          The candidate just answered your last question.
          Your Last Question: "${question}"
          Candidate's Answer: "${answer}"
          
          Your task is to provide two things in a JSON object:
          1.  **feedback**: Provide detailed, constructive feedback on the candidate's last answer. Analyze its technical accuracy, clarity, and depth in the context of their stated tech stack.
          2.  **followUpQuestion**: Based on their answer and the conversation history, ask a natural, conversational follow-up question that logically dives deeper into the topic and aligns with their profile.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    feedback: {
                        type: Type.STRING,
                        description: "Detailed feedback on the answer in markdown format."
                    },
                    followUpQuestion: {
                        type: Type.STRING,
                        description: "A single, conversational follow-up question."
                    }
                },
                required: ["feedback", "followUpQuestion"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Failed to parse JSON feedback from Gemini response:", response.text, error);
        return {
            feedback: "I'm sorry, I had a little trouble processing that. Let's try another angle.",
            followUpQuestion: "Let's switch gears. What's a recent technical challenge you faced and how did you overcome it?"
        }
    }
};

export const generateFollowUpQuestion = async (
    conversation: { question: string, answer: string }[],
    config: InterviewConfig
): Promise<string> => {
    const historyString = conversation.map(turn => `Interviewer: ${turn.question}\nCandidate: ${turn.answer}`).join('\n\n');

    const prompt = `
    You are an expert technical interviewer in the middle of an interview.
    
    **Candidate Profile:**
    - **Target Role:** ${config.role}
    - **Experience Level:** ${config.experience}
    - **Key Technologies:** ${config.techStack.join(', ')}
    - **Job Description Context:** ${config.jobDescription || 'N/A'}

    **Conversation History:**
    ---
    ${historyString}
    ---

    **Your Task & Strict Constraints:**
    Based on the candidate's last answer and adhering to the profile constraints, ask the **next logical follow-up question**.
    - The follow-up MUST be relevant to the last answer or a closely related topic.
    - The question should align with the required technologies and job description.
    - The questions should progressively get more challenging.
    - **Return ONLY the question text.**
    `;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    return response.text;
};

export const getTechnicalInterviewFeedback = async (
    conversation: { question: string, answer: string }[],
    config: InterviewConfig
): Promise<string[]> => {
    const transcript = conversation.map((turn, i) => `
---
**Question ${i + 1}:** ${turn.question}
**Candidate's Answer:** ${turn.answer}
---
    `).join('');

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
            URGENT: Your top priority is speed. Generate this feedback as fast as you can. You are a senior engineering manager providing feedback on a technical interview.
            Below is the full transcript.
            
            **Candidate Profile:**
            - **Target Role:** ${config.role}
            - **Experience Level:** ${config.experience}
            - **Key Technologies:** ${config.techStack.join(', ')}

            **Full Interview Transcript:**
            ${transcript}

            **Your Task:**
            Provide detailed, constructive feedback for **each** answer provided by the candidate, keeping their profile in mind. Your response must be a JSON object containing an array of feedback strings under the key "feedbacks". Each string in the array corresponds to one Q&A pair and should use markdown for formatting. The number of items in the 'feedbacks' array must exactly match the number of Q&A pairs.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    feedbacks: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ["feedbacks"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        return parsed.feedbacks;
    } catch (error) {
        console.error("Failed to parse JSON feedback from Gemini response:", response.text, error);
        // Fallback to avoid crash
        return conversation.map(() => "Sorry, I was unable to generate feedback for this answer.");
    }
};

export const getTechnicalSessionFeedback = async (
    conversation: { question: string, answer: string }[],
    config: InterviewConfig
): Promise<{ rating: string, summary: string, report: string }> => {
    const transcript = conversation.map((turn, i) => `
---
**Question ${i + 1}:** ${turn.question}
**Candidate's Answer:** ${turn.answer}
---
    `).join('');

    const prompt = `
    You are a friendly, senior engineering manager providing a final performance review for a candidate after a technical interview.

    **Candidate Profile:**
    - **Target Role:** ${config.role}
    - **Experience Level:** ${config.experience}
    - **Key Technologies:** ${config.techStack.join(', ')}
    - **Job Description Context:** ${config.jobDescription || 'N/A'}

    **Full Interview Transcript:**
    ${transcript}

    **Your Task:**
    Provide a JSON object with three keys: "rating", "summary", and "report". The analysis in the report must be contextualized by the candidate's profile (role, tech stack, JD).
    1.  **rating**: A single-word rating from: "Strong", "Average", "Weak".
    2.  **summary**: A single-paragraph (3-4 sentences) summary of their performance.
    3.  **report**: A comprehensive feedback report in markdown format.

    **Report Structure (for the "report" key):**
    # Technical Interview Report
    
    ### Overall Summary
    - Briefly summarize their performance in the context of the target role and tech stack.

    ### Key Strengths
    - List 2-3 specific areas where the candidate did well, especially concerning the specified technologies.

    ### Areas for Improvement
    - List 2-3 specific, actionable areas for improvement, focusing on gaps related to the role or job description.
    
    ### Final Thoughts
    - End with an encouraging closing statement.
    `;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    rating: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    report: { type: Type.STRING },
                },
                required: ["rating", "summary", "report"],
            }
        }
    });
    try {
        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Failed to parse technical session feedback:", response.text, error);
        return { rating: 'N/A', summary: 'Error generating feedback.', report: 'Could not generate a report.' };
    }
};


export const generateHrQuestion = async () => {
    const prompt = `
    You are an experienced, professional Human Resources (HR) interviewer with a warm and encouraging tone. Your goal is to create a dynamic and conversational interview experience.

    Generate the **first** interview question. This question should be a common opening behavioral question that helps you get to know the candidate.

    **Stylistic Directives:**
    - **Use Connecting Phrases:** Start with a phrase that sets a positive, professional tone.
    - **Set the Scene/Context:** Briefly explain why you're asking the question.
    - **Focus on Behavior and Fit:** The question should prompt a story or example from the candidate's past experiences.

    **Example of your style:** Instead of asking "Tell me about yourself," you might ask, "To start, I'd love to get a better sense of your journey. Could you walk me through your resume, highlighting the key experiences that have led you to apply for this role today?"

    Return ONLY the question text.
  `;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    return response.text;
};

// FIX: Add generateMultipleHrQuestions for mock interviews.
export const generateMultipleHrQuestions = async (count: number): Promise<string[]> => {
    const prompt = `
    URGENT: Your top priority is speed. Generate the response as fast as possible. Generate ${count} distinct, common behavioral or situational HR interview questions.
    Focus on a variety of topics like teamwork, leadership, handling pressure, dealing with conflict, and motivation.

    Return the questions as a JSON object with a single key "questions" containing an array of strings.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ["questions"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.questions && Array.isArray(parsed.questions)) {
            return parsed.questions;
        }
        throw new Error("Invalid response format from AI.");
    } catch (error) {
        console.error("Failed to parse multiple HR questions from Gemini:", response.text, error);
        // Fallback
        const questions: string[] = [];
        for (let i = 0; i < count; i++) {
            questions.push(await generateHrQuestion());
        }
        return questions;
    }
};

// FIX: Add getHrInterviewFeedback for mock interviews.
export const getHrInterviewFeedback = async (
    conversation: { question: string, answer: string }[]
): Promise<string[]> => {
    const transcript = conversation.map((turn, i) => `
---
**Question ${i + 1}:** ${turn.question}
**Candidate's Answer:** ${turn.answer}
---
    `).join('');

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
            URGENT: Your top priority is speed. Generate this feedback as fast as you can. You are an expert HR Manager providing feedback on a behavioral interview. Your response time is critical.
            Below is the full transcript.

            **Your Task:**
            Provide detailed, constructive feedback for **each** answer provided by the candidate. Your response must be a JSON object containing an array of feedback strings under the key "feedbacks". Each string in the array should correspond to one Q&A pair from the transcript. Focus on the answer's structure (like the STAR method), clarity, and impact. Use markdown for formatting. The number of items in the 'feedbacks' array must exactly match the number of Q&A pairs.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    feedbacks: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ["feedbacks"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.feedbacks && Array.isArray(parsed.feedbacks)) {
            return parsed.feedbacks;
        }
        throw new Error("Invalid response format");
    } catch (error) {
        console.error("Failed to parse JSON feedback from Gemini response:", response.text, error);
        // Fallback to avoid crash
        return conversation.map(() => "Sorry, I was unable to generate feedback for this answer.");
    }
};

export const getHrPerQuestionFeedback = async (
    question: string,
    answer: string,
    chatHistory: { question: string, answer: string }[]
): Promise<string> => {
    const historyString = chatHistory.map(turn => `Interviewer: ${turn.question}\nCandidate: ${turn.answer}`).join('\n\n');

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          You are an expert HR interview coach. The candidate is in a behavioral interview.
          
          This is the conversation so far:
          ---
          ${historyString}
          ---

          The candidate just answered your last question.
          Your Last Question: "${question}"
          Candidate's Answer: "${answer}"
          
          Your task is to provide concise, analytical feedback on just this single answer. This feedback is for internal analysis and will be compiled into a final report later.
          Focus on:
          - How well they used the STAR method (Situation, Task, Action, Result). Pay close attention to the Result - is it quantified?
          - The clarity and impact of their response.
          - The language they used (e.g., confident, team-oriented vs. hedging).
          
          Return ONLY the feedback text in markdown format. Do not add a follow-up question or any introductory phrases.
        `,
    });

    return response.text;
};

export const generateHrFollowUpQuestion = async (
    conversation: { question: string, answer: string }[]
): Promise<string> => {
    const historyString = conversation.map(turn => `Interviewer: ${turn.question}\nCandidate: ${turn.answer}`).join('\n\n');

    const prompt = `
    You are an experienced, professional HR interviewer with a warm and encouraging tone, currently in a behavioral interview.
    Your goal is to understand the candidate's experiences and personality by asking relevant follow-up questions.
    
    **Conversation History:**
    ---
    ${historyString}
    ---

    **Your Task:**
    Based on the candidate's last answer and the conversation so far, generate the **next logical follow-up question**.

    **Stylistic Directives:**
    - **Dig Deeper Naturally:** If the answer was general, ask for specifics. If they described a situation, ask about the outcome or what they learned.
    - **Set Context:** Frame the question with a connecting phrase. For example, "That's a great example. Building on that..." or "I appreciate you sharing that. It makes me wonder..."
    - **Focus on Reflection:** Ask questions that encourage the candidate to reflect on their experiences. For example, "Looking back, what would you have done differently?"
    - **Keep it Conversational:** The question should be 2-3 lines long and feel like a natural part of a conversation, not a quiz.
    
    **Example of your style:** If the candidate just described a team project, instead of "What was the result?", you might ask, "Thanks for walking me through that. Looking back at the project, what's the one key lesson you took away from that experience that you now apply to your work?"

    Return ONLY the question text.
    `;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    return response.text;
};

export const getHrFinalReport = async (
    conversation: { question: string, answer: string }[],
    perQuestionFeedback: string[]
): Promise<{ rating: string, summary: string, report: string }> => {
    const transcriptWithFeedback = conversation.map((turn, i) => `
---
**Question ${i + 1}:** ${turn.question}
**Candidate's Answer:** ${turn.answer}
**Coach's Initial Analysis:** ${perQuestionFeedback[i] || "N/A"}
---
    `).join('');

    const systemInstruction = `You are an elite, world-class interview coach known for your direct, tactical, and transformative feedback. You synthesize per-question analysis into a holistic, actionable final report.`;

    const contents = `
    **CANDIDATE PERFORMANCE ANALYSIS & ACTION PLAN**

    **Interview Transcript with Per-Question Analysis:**
    ${transcriptWithFeedback}

    ---

    **YOUR DIRECTIVE:**
    Conduct a final, holistic analysis of the candidate's performance. Synthesize the per-question analysis to identify overarching patterns.
    Your response **MUST** be a valid JSON object with three keys: "rating", "summary", and "report".

    1.  **rating**: A single-word string rating. One of: "Needs Improvement", "Promising", "Strong".
    2.  **summary**: A concise, single-paragraph summary of their performance (3-4 sentences).
    3.  **report**: The full, comprehensive feedback report in Markdown format.

    **STRUCTURE FOR THE "report" MARKDOWN:**

    # HR Interview Report

    ### Overall Performance Assessment
    *   Start with a single, concise sentence summarizing their performance and include the rating. Example: "This was a promising performance that demonstrates a good grasp of storytelling, but a consistent lack of quantified results is the primary area holding you back from a top-tier offer. **Rating: Promising**"

    ### Top 3 Strengths
    *   **[Strength Title #1]:** In one sentence, clearly state a strength observed across multiple answers.
        *   **Proof Point:** Quote their best example from the transcript.
    *   **[Strength Title #2]:** State another key strength.
        *   **Proof Point:** Provide another specific example.
    *   **[Strength Title #3]:** State a third strength.
        *   **Proof Point:** Provide a final example.

    ### Top 3 Actionable Growth Areas
    *   **[Improvement Area #1 - e.g., "Quantify Your Impact"]:** State the problem directly, referencing patterns.
        *   **The Evidence:** Quote a weak part of an answer. "For example, you said, '...and the feature launch went really well.'"
        *   **The Fix (Before & After):** Provide a concrete rewrite. "**Before:** '...the feature launch went really well.' **After (Example):** '...which led to a 15% increase in user engagement.'"
    *   **[Improvement Area #2]:** State the second problem.
        *   **The Evidence & The Fix:** Provide another clear example.
    *   **[Improvement Area #3]:** State the third problem.
        *   **The Evidence & The Fix:** Provide a final clear example.

    ---
    ### Detailed Question-by-Question Breakdown

    ${conversation.map((turn, i) => `
**Question ${i + 1}:** ${turn.question}

**Analysis:**
${perQuestionFeedback[i] || "No analysis available."}
    `).join('\n\n')}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    rating: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    report: { type: Type.STRING }
                },
                required: ["rating", "summary", "report"]
            }
        }
    });
    try {
        return JSON.parse(response.text.trim());
    } catch (e) {
        console.error("Failed to parse HR report JSON:", response.text, e);
        return { rating: 'N/A', summary: 'Error generating feedback.', report: 'Could not generate a report.' };
    }
};


export const generateGdTopics = async (): Promise<{ topic: string, description: string }[]> => {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Generate three distinct group discussion topics for engineering students. The topics should be:
    1.  **One Abstract Topic:** A philosophical or conceptual topic to test critical thinking and articulation (e.g., 'Is failure a better teacher than success?').
    2.  **One Technical Topic:** A current and debatable topic relevant to the engineering/tech industry (e.g., 'The ethics of AI in autonomous vehicles').
    3.  **One General Interest/Random Topic:** A current affairs or social issue that requires general awareness (e.g., 'Should social media platforms be responsible for moderating content?').
    
    For each topic, provide a concise title and a 4-5 line description that sets the context and presents the core dilemma or question to be debated.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topics: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                topic: {
                                    type: Type.STRING,
                                    description: "A concise, engaging title for the discussion topic."
                                },
                                description: {
                                    type: Type.STRING,
                                    description: "A 4-5 line description providing context and the central point of debate."
                                }
                            },
                            required: ["topic", "description"]
                        }
                    }
                },
                required: ["topics"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
            return parsed.topics;
        }
        throw new Error("Invalid response format from AI.");
    } catch (error) {
        console.error("Failed to parse GD topics from Gemini:", response.text, error);
        // Fallback in case of parsing failure
        return [
            { topic: "Success vs. Hard Work: Is one more important?", description: "Many believe that relentless hard work is the sole key to achieving one's goals. Others argue that 'working smart' or being in the right place at the right time (luck/success) plays a larger role. In today's world, which factor is a more critical determinant of long-term professional achievement, and why?" },
            { topic: "The Future of Open Source Software", description: "Open-source software powers much of the modern internet, yet it often relies on unpaid volunteers, leading to burnout and security risks. Should large corporations that profit from open-source be mandated to contribute financially to these projects, or would that stifle the community-driven spirit of the movement?" },
            { topic: "Gig Economy: Liberation or Exploitation?", description: "Platforms like Uber, DoorDash, and freelance marketplaces offer flexibility and autonomy to millions. However, they are also criticized for a lack of worker protections, benefits, and stable income. Is the gig economy a modern form of worker empowerment or a loophole that allows companies to bypass traditional labor laws?" }
        ];
    }
};

export const generateGdOpeningStatement = async (topic: string): Promise<string> => {
    const prompt = `You are a neutral and friendly moderator for a group discussion. Your task is to provide a single, welcoming opening statement to kick off the discussion. Acknowledge the topic and invite participants to share their initial thoughts. Keep it concise (1-2 sentences). The topic is: "${topic}". Return ONLY the message text.`;
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    return response.text;
};

export const orchestrateGdTurn = async (topic: string, chatHistory: string, ai1Name: string, ai2Name: string): Promise<{ participant: string, message: string }[]> => {
    const prompt = `
    You are an orchestrator for a group discussion. You control two AI participants with very distinct personalities:
    - **${ai1Name} (The Analyst):** ${ai1Name} is analytical, data-driven, and pragmatic. They approach topics from a logical, evidence-based perspective. They often cite statistics (real or hypothetical), question the feasibility of ideas, and focus on efficiency, scalability, and measurable outcomes. They are the voice of reason.
    - **${ai2Name} (The Visionary):** ${ai2Name} is creative, user-focused, and empathetic. They champion the user experience, consider long-term ethical and societal impacts, and propose innovative or "out-of-the-box" ideas. They focus on the "why" and "how it affects people".

    **Discussion Topic:** "${topic}"
    
    **Conversation History:**
    ---
    ${chatHistory}
    ---

    **Your Task:**
    Based on the last statement from the user and the conversation so far, generate the next logical response(s) to continue the discussion.
    - Adhere strictly to the defined personalities for ${ai1Name} and ${ai2Name}. ${ai1Name} should challenge ideas with logic and data, while ${ai2Name} should explore the human and creative angles.
    - Decide who should speak: ${ai1Name}, ${ai2Name}, or both. They can agree, but more often they should offer contrasting viewpoints to create a dynamic discussion.
    - Keep responses concise (1-3 sentences).
    
    Your response **MUST** be a valid JSON object. The 'participant' field in each response object must be exactly one of these two strings: '${ai1Name}' or '${ai2Name}'.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    responses: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                participant: {
                                    type: Type.STRING,
                                    enum: [ai1Name, ai2Name]
                                },
                                message: { type: Type.STRING }
                            },
                            required: ["participant", "message"]
                        }
                    }
                },
                required: ["responses"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        return parsed.responses;
    } catch (error) {
        console.error("Failed to parse GD orchestration from Gemini:", response.text, error);
        return [{ participant: ai1Name, message: "I'm sorry, I seem to have lost my train of thought. Could you repeat your last point?" }];
    }
};

export const reviewProfile = async (profileData: {
    resumeText: string;
    linkedinUrl?: string;
    githubUrl?: string;
    targetRole: string;
    targetCompanyTier: string;
}): Promise<{ rating: string, summary: string, keyRecommendations: string[], feedback: string }> => {
    const { resumeText, linkedinUrl, githubUrl, targetRole, targetCompanyTier } = profileData;

    const recruiterPersona = targetCompanyTier
        ? `You are a world-class career coach and recruiter for ${targetCompanyTier} companies, specializing in hiring for the ${targetRole} position.`
        : `You are a world-class career coach and generalist recruiter, specializing in hiring for the ${targetRole} position. Your feedback should focus on broad best practices applicable across industries.`;

    const keywordInstruction = targetCompanyTier
        ? `Focus on keywords relevant to ${targetCompanyTier} companies.`
        : 'Suggest general, high-demand keywords.';

    const prompt = `
    ${recruiterPersona}
    You will conduct a comprehensive audit of a candidate's professional profile based on their resume, LinkedIn, and GitHub.
    Your feedback must be direct, actionable, and structured.

    **Candidate's Information:**
    - **Target Role:** ${targetRole}
    - **Target Company Tier:** ${targetCompanyTier || 'General / Not specified'}
    - **LinkedIn Profile:** ${linkedinUrl || 'Not provided'}
    - **GitHub Profile:** ${githubUrl || 'Not provided'}
    - **Resume Text:**
      ---
      ${resumeText}
      ---

    **Your Task:**
    Provide a JSON object with four keys: "rating", "summary", "keyRecommendations", and "feedback".
    1.  **rating**: A single-word rating for the profile's current state: "Needs Work", "Good", or "Excellent".
    2.  **summary**: A concise, single-paragraph summary of the profile's strengths and weaknesses.
    3.  **keyRecommendations**: A JSON array of exactly three strings, representing the top 3 most actionable recommendations.
    4.  **feedback**: The full, comprehensive review in markdown format, following the structure below.

    **STRUCTURE FOR THE "feedback" MARKDOWN:**

    ### Overall Impression & Brand Cohesion (The 20-Second Test)
    - Give a quick, high-level summary. Does their profile tell a clear, consistent story for the target role?
    - Is their personal brand cohesive across their resume and any provided profiles?

    ### Resume/CV Deep Dive
    - **Impact vs. Responsibilities:** Are the bullet points action-oriented and results-driven (e.g., "Increased performance by 30% by implementing X") or just a list of duties (e.g., "Responsible for building Y")? Provide a specific example of how they can improve a bullet point.
    - **Keyword Alignment:** Does the resume contain the right keywords for the ${targetRole} role, considering common technologies and skills? ${keywordInstruction} Suggest 3-5 keywords they should add.
    - **Formatting & Readability:** Is it clean, easy to scan, and free of typos? Comment on the length and structure.

    ### LinkedIn Profile Analysis (If provided)
    - **Headline & Summary:** Is the headline optimized for search (e.g., "${targetRole} | Tech Stack Keywords")? Does the summary effectively pitch their value proposition?
    - **Experience Section:** Does it match the resume? Do they use the summary space to add more context or stories?
    - **Activity & Engagement:** Do they engage with relevant content? Is their profile complete (skills, recommendations, etc.)?

    ### GitHub Profile Analysis (If provided)
    - **Project Quality:** Are there well-documented, non-trivial projects? Is the code clean and well-organized?
    - **Pinned Repositories:** Are their best projects pinned and showcased effectively?
    - **Contribution History:** Is their activity graph ("green squares") consistent? Does it show a pattern of regular coding?

    ### Top 3 Actionable Recommendations
    1.  **[High-Impact Suggestion #1]:** (This should match the first item in the keyRecommendations array).
    2.  **[High-Impact Suggestion #2]:** (This should match the second item).
    3.  **[High-Impact Suggestion #3]:** (This should match the third item).
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    rating: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    keyRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                    feedback: { type: Type.STRING }
                },
                required: ["rating", "summary", "keyRecommendations", "feedback"]
            }
        }
    });
    try {
        return JSON.parse(response.text.trim());
    } catch (e) {
        console.error("Failed to parse profile review JSON:", response.text, e);
        return { rating: 'N/A', summary: 'Error generating feedback.', keyRecommendations: [], feedback: 'Could not generate a report.' };
    }
};

export const getMockInterviewOverallFeedback = async (
    results: MockInterviewRoundResult[],
    role: string,
    companyTier: string
): Promise<{ recommendation: string, summary: string, report: string }> => {

    let transcript = '';
    let currentRound = '';

    results.forEach(result => {
        if (result.type !== currentRound) {
            currentRound = result.type;
            transcript += `\n\n--- ${currentRound.toUpperCase()} ROUND ---\n`;
        }
        if (result.type === 'Aptitude') {
            transcript += `Result: Scored ${result.correctAnswers}/${result.total} (${result.score?.toFixed(0)}%)\n`;
        } else {
            transcript += `Q: ${result.question}\nA: ${result.answer}\nFeedback: ${result.feedback}\n\n`;
        }
    });

    const prompt = `
    URGENT: Your highest priority is speed. Generate the response as fast as you can. You are a Senior Hiring Manager at a ${companyTier} company, responsible for hiring for the ${role} position.
    You have just completed a multi-round interview with a candidate and are writing your final feedback.

    **Full Interview Transcript & Results:**
    ${transcript}

    **Your Task:**
    Provide a JSON object with three keys: "recommendation", "summary", and "report".
    1.  **recommendation**: A final hiring recommendation. Must be one of: "Strong Hire", "Hire", "Leaning No", or "No Hire".
    2.  **summary**: A concise, single-paragraph summary of the candidate's performance across all rounds.
    3.  **report**: A single, holistic feedback report in markdown format.

    **STRUCTURE FOR THE "report" MARKDOWN:**

    ### Overall Performance Summary
    - Start with a 2-3 sentence high-level summary of the candidate's performance across all rounds.
    - State the final hiring recommendation clearly.

    ### Key Strengths
    - List 2-3 specific areas where the candidate excelled. Pull examples directly from the interview (e.g., "demonstrated deep knowledge of X in the technical round," "structured their answer to the conflict question perfectly").

    ### Major Areas for Development
    - List the 2-3 most critical areas for improvement. Be direct but constructive. (e.g., "struggled with fundamental data structures," "answers in the HR round lacked quantifiable results," "aptitude score indicates a potential weakness in quantitative skills").

    ### Round-by-Round Analysis
    - **Aptitude Round:** Briefly comment on their score and what it implies.
    - **Technical Round:** Summarize their technical abilities based on their answers. Were they strong in fundamentals? Problem-solving?
    - **HR Round:** Comment on their behavioral answers, communication skills, and apparent cultural fit.

    ### Final Advice for the Candidate
    - Conclude with a single paragraph of actionable advice for the candidate to help them improve for future interviews.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    recommendation: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    report: { type: Type.STRING }
                },
                required: ["recommendation", "summary", "report"]
            }
        }
    });

    try {
        return JSON.parse(response.text.trim());
    } catch (e) {
        console.error("Failed to parse mock interview feedback:", response.text, e);
        return { recommendation: 'N/A', summary: 'Error generating feedback.', report: 'Could not generate a report.' };
    }
};