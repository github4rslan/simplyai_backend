import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

const router = express.Router();

// Get all prompt templates for a specific plan
router.get("/plan/:planId", async (req, res) => {
  try {
    const { planId } = req.params;

    // Fetch all prompt templates for the given plan ID
    const [promptTemplateRows] = await pool.query(
      `
      SELECT * FROM prompt_templates 
      WHERE plan_id = ? 
      ORDER BY sequence_index ASC
    `,
      [planId]
    );

    res.json({
      success: true,
      data: promptTemplateRows,
    });
  } catch (error) {
    console.error("Error fetching prompt templates for plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch prompt templates",
    });
  }
});

// Get prompt templates for a specific plan and questionnaire
router.get("/plan/:planId/questionnaire/:questionnaireId", async (req, res) => {
  try {
    const { planId, questionnaireId } = req.params;

    // Fetch prompt templates for the given plan ID and questionnaire ID
    const [rows] = await pool.query(
      `
      SELECT * FROM prompt_templates 
      WHERE plan_id = ? AND questionnaire_id = ?
      ORDER BY sequence_index ASC
    `,
      [planId, questionnaireId]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(
      "Error fetching prompt templates for plan and questionnaire:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch prompt templates",
    });
  }
});

// Get specific prompt template by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch a specific prompt template by ID
    const [rows] = await pool.query(
      `
      SELECT * FROM prompt_templates WHERE id = ?
    `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Prompt template not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Error fetching prompt template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch prompt template",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    console.log("📥 Saving the template of the prompt");
    const {
      plan_id,
      questionnaire_id,
      title,
      content,
      prompt_principale,
      system_prompt,
      variables,
      sequence_index,
      sections_data,
      report_template,
      reportTemplate,
      template_structure,
      reference_questionnaires,
    } = req.body;

    // Validate required fields
    if (!plan_id || !questionnaire_id) {
      return res.status(400).json({
        success: false,
        message: "Plan ID and questionnaire ID are required",
      });
    }

    // Prepare the final values
    const finalSystemPrompt =
      system_prompt ||
      "Sei un assistente esperto che analizza i dati dei questionari.";
    const finalPromptPrincipale = content || prompt_principale || "";
    const finalTemplateStructure =
      template_structure || reportTemplate || report_template || "";
    const sectionsData = sections_data || {};
    const referenceQuestionnaires = reference_questionnaires || {};

    console.log(
      "🔧 Processing prompt template for questionnaire:",
      questionnaire_id
    );

    // ✅ STEP 1: FETCH MAIN QUESTIONNAIRE DATA
    let mainQuestionnaire = {
      id: questionnaire_id,
      title: "",
      description: "",
      questions: null,
    };

    try {
      const [questionnaireRows] = await pool.query(
        `SELECT id, title, description, questions FROM questionnaire_config WHERE id = ?`,
        [questionnaire_id]
      );

      if (questionnaireRows.length > 0) {
        mainQuestionnaire.title =
          questionnaireRows[0].title || "Untitled Questionnaire";
        mainQuestionnaire.description = questionnaireRows[0].description || "";

        // Parse questions JSON
        if (questionnaireRows[0].questions) {
          try {
            mainQuestionnaire.questions =
              typeof questionnaireRows[0].questions === "string"
                ? JSON.parse(questionnaireRows[0].questions)
                : questionnaireRows[0].questions;
          } catch (parseError) {
            console.error(
              "❌ Error parsing main questionnaire questions:",
              parseError
            );
            mainQuestionnaire.questions = null;
          }
        }

        console.log(
          `✅ Fetched main questionnaire: ${mainQuestionnaire.title}`
        );
      } else {
        console.warn("⚠️ Main questionnaire not found");
      }
    } catch (error) {
      console.error("❌ Error fetching main questionnaire:", error);
    }

    // ✅ STEP 2: FETCH REFERENCE QUESTIONNAIRES DATA
    let referenceQuestionnairesData = {};

    if (Object.keys(referenceQuestionnaires).length > 0) {
      console.log("🔍 Fetching reference questionnaires...");

      // Collect unique questionnaire IDs
      const uniqueQuestionnaireIds = new Set();

      for (const [sectionId, refs] of Object.entries(referenceQuestionnaires)) {
        if (Array.isArray(refs)) {
          refs.forEach((ref) => {
            if (ref.questionnaireId) {
              uniqueQuestionnaireIds.add(ref.questionnaireId);
            }
          });
        }
      }

      // Fetch each unique reference questionnaire
      for (const refQId of uniqueQuestionnaireIds) {
        try {
          const [refQuestionnaireRows] = await pool.query(
            `SELECT id, title, description, questions FROM questionnaire_config WHERE id = ?`,
            [refQId]
          );

          if (refQuestionnaireRows.length > 0) {
            let refQuestions = null;

            if (refQuestionnaireRows[0].questions) {
              try {
                refQuestions =
                  typeof refQuestionnaireRows[0].questions === "string"
                    ? JSON.parse(refQuestionnaireRows[0].questions)
                    : refQuestionnaireRows[0].questions;
              } catch (parseError) {
                console.error(
                  `❌ Error parsing questions for ref questionnaire ${refQId}:`,
                  parseError
                );
              }
            }

            referenceQuestionnairesData[refQId] = {
              id: refQId,
              title: refQuestionnaireRows[0].title || "Untitled",
              description: refQuestionnaireRows[0].description || "",
              questions: refQuestions,
            };

            console.log(
              `✅ Fetched reference questionnaire: ${referenceQuestionnairesData[refQId].title}`
            );
          }
        } catch (error) {
          console.error(
            `❌ Error fetching reference questionnaire ${refQId}:`,
            error
          );
        }
      }
    }

    // ✅ STEP 3: PARSE SECTIONS DATA
    let parsedSectionsData;
    try {
      parsedSectionsData =
        typeof sectionsData === "string"
          ? JSON.parse(sectionsData)
          : sectionsData || {};
    } catch (error) {
      console.error("❌ Error parsing sections_data:", error);
      parsedSectionsData = {};
    }

    // ✅ STEP 4: GENERATE AI RESPONSE
    let generatedAIResponse = null;

    try {
      console.log("🤖 Generating AI response preview...");

      // Build section requirements for the prompt
      let sectionRequirements = "";

      if (parsedSectionsData.text && Array.isArray(parsedSectionsData.text)) {
        sectionRequirements += "\nTEXT SECTIONS:\n";
        parsedSectionsData.text.forEach((section) => {
          sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}"`;
          if (section.prompt)
            sectionRequirements += `, Instructions: "${section.prompt}"`;
          sectionRequirements += "\n";
        });
      }

      if (
        parsedSectionsData.charts &&
        Array.isArray(parsedSectionsData.charts)
      ) {
        sectionRequirements += "\nCHART SECTIONS:\n";
        parsedSectionsData.charts.forEach((section) => {
          sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"`;
          if (section.prompt)
            sectionRequirements += `, Instructions: "${section.prompt}"`;
          sectionRequirements += "\n";
        });
      }

      if (
        parsedSectionsData.tables &&
        Array.isArray(parsedSectionsData.tables)
      ) {
        sectionRequirements += "\nTABLE SECTIONS:\n";
        parsedSectionsData.tables.forEach((section) => {
          sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"`;
          if (section.prompt)
            sectionRequirements += `, Instructions: "${section.prompt}"`;
          sectionRequirements += "\n";
        });
      }

      // Sample test data for AI preview
      const testResponses = {
        sample: "This is sample test data to generate a preview response",
      };

      const finalPrompt = `You are an expert report generation AI assistant. Create a professional, comprehensive report in JSON format.

CONTEXT AND INSTRUCTIONS:
${finalSystemPrompt}
${
  finalPromptPrincipale
    ? `\nAdditional Guidelines: ${finalPromptPrincipale}`
    : ""
}

USER INPUT DATA (SAMPLE):
${JSON.stringify(testResponses, null, 2)}

REQUIRED SECTIONS TO GENERATE:
${sectionRequirements}

DETAILED GENERATION RULES:

1. TEXT SECTIONS:
   - Write substantive, professional content (minimum 150 words per section)
   - Write in clear paragraphs with proper structure

2. CHART SECTIONS:
   - Generate meaningful, realistic data
   - Use 3-7 data points with clear labels

3. TABLE SECTIONS:
   - Create descriptive, relevant headers (3-5 columns)
   - Generate 4-8 rows of meaningful data

OUTPUT FORMAT:
{
  "sections": [
    {
      "section_type": "text",
      "id": "1",
      "shortcode": "intro",
      "title": "Introduction",
      "content": "..."
    }
  ]
}

Generate the report now:`;

      // Call OpenAI API
      const aiResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a professional report generation AI. You MUST respond with ONLY valid JSON.",
            },
            {
              role: "user",
              content: finalPrompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 6000,
          response_format: { type: "json_object" },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      let aiContent = aiResponse.data.choices[0].message.content.trim();
      aiContent = aiContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      generatedAIResponse = JSON.parse(aiContent);
      console.log("✅ AI response generated successfully");
    } catch (aiError) {
      console.error("⚠️ Failed to generate AI response:", aiError.message);
      // Continue without AI response if it fails
    }

    // ✅ STEP 5: BUILD COMPLETE AI RESPONSE DATA STRUCTURE
    const completeAIResponseData = {
      metadata: {
        generated_at: new Date().toISOString(),
        version: "1.0",
      },
      prompt_structure: {
        system_prompt: finalSystemPrompt,
        main_prompt: finalPromptPrincipale,
        sections_data: parsedSectionsData,
        reference_questionnaires: referenceQuestionnaires,
      },
      main_questionnaire: {
        id: mainQuestionnaire.id,
        title: mainQuestionnaire.title,
        description: mainQuestionnaire.description,
        questions: mainQuestionnaire.questions,
      },
      reference_questionnaires_data: referenceQuestionnairesData,
      ai_generated_response: generatedAIResponse,
    };

    console.log("📦 Complete AI response data structure created");

    // ✅ STEP 6: CHECK IF RECORD EXISTS AND UPDATE/INSERT
    const [existingRows] = await pool.query(
      `SELECT id FROM prompt_templates 
       WHERE plan_id = ? AND questionnaire_id = ?`,
      [plan_id, questionnaire_id]
    );

    if (existingRows.length > 0) {
      // UPDATE existing record
      const updateQuery = `
        UPDATE prompt_templates SET 
          title = ?, 
          content = ?, 
          system_prompt = ?, 
          variables = ?, 
          sequence_index = ?, 
          sections_data = ?, 
          report_template = ?, 
          reference_questionnaires = ?,
          ai_response = ?,
          updated_at = NOW()
        WHERE id = ?
      `;

      await pool.execute(updateQuery, [
        title,
        finalPromptPrincipale,
        finalSystemPrompt,
        JSON.stringify(variables || []),
        sequence_index || 0,
        JSON.stringify(sectionsData),
        finalTemplateStructure,
        JSON.stringify(referenceQuestionnaires),
        JSON.stringify(completeAIResponseData),
        existingRows[0].id,
      ]);

      console.log("✅ Updated existing prompt template:", existingRows[0].id);

      res.json({
        success: true,
        message: "Prompt template updated successfully",
        data: {
          id: existingRows[0].id,
          ai_response: completeAIResponseData,
        },
      });
    } else {
      // INSERT new record
      const newId = uuidv4();
      const insertQuery = `
        INSERT INTO prompt_templates (
          id, plan_id, questionnaire_id, title, content, system_prompt, 
          variables, sequence_index, sections_data, report_template, 
          reference_questionnaires, ai_response, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      await pool.execute(insertQuery, [
        newId,
        plan_id,
        questionnaire_id,
        title,
        finalPromptPrincipale,
        finalSystemPrompt,
        JSON.stringify(variables || []),
        sequence_index || 0,
        JSON.stringify(sectionsData),
        finalTemplateStructure,
        JSON.stringify(referenceQuestionnaires),
        JSON.stringify(completeAIResponseData),
      ]);

      console.log("✅ Created new prompt template:", newId);

      res.json({
        success: true,
        message: "Prompt template created successfully",
        data: {
          id: newId,
          ai_response: completeAIResponseData,
        },
      });
    }
  } catch (error) {
    console.error("❌ Error creating/updating prompt template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save prompt template",
      error: error.message,
    });
  }
});

// Update prompt template
// Update prompt template
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      plan_id,
      questionnaire_id,
      title,
      content,
      prompt_principale,
      system_prompt,
      variables,
      sequence_index,
      sections_data,
      report_template,
      reportTemplate,
      template_structure,
      reference_questionnaires,
    } = req.body;

    console.log("📥 PUT - Received data for ID:", id, {
      content: content?.substring(0, 50) + "...",
      prompt_principale: prompt_principale?.substring(0, 50) + "...",
      system_prompt: system_prompt?.substring(0, 50) + "...",
      template_structure: template_structure?.substring(0, 50) + "...",
      reportTemplate: reportTemplate?.substring(0, 50) + "...",
      reference_questionnaires: reference_questionnaires
        ? Object.keys(reference_questionnaires).length + " references"
        : "none",
    });

    // Prepare the final values with proper priority
    const finalSystemPrompt =
      system_prompt ||
      "Sei un assistente esperto che analizza i dati dei questionari.";
    const finalPromptPrincipale = content || prompt_principale || "";
    const finalTemplateStructure =
      template_structure || reportTemplate || report_template || "";
    const sectionsData = sections_data || {};
    const referenceQuestionnaires = reference_questionnaires || {};

    // ✅ STEP 1: Fetch existing record to get plan_id and questionnaire_id if not provided
    let planId = plan_id;
    let questionnaireId = questionnaire_id;

    if (!planId || !questionnaireId) {
      const [existingTemplate] = await pool.query(
        `SELECT plan_id, questionnaire_id FROM prompt_templates WHERE id = ?`,
        [id]
      );

      if (existingTemplate.length > 0) {
        planId = planId || existingTemplate[0].plan_id;
        questionnaireId =
          questionnaireId || existingTemplate[0].questionnaire_id;
      } else {
        return res.status(404).json({
          success: false,
          message: "Prompt template not found",
        });
      }
    }

    // ✅ STEP 2: FETCH MAIN QUESTIONNAIRE DATA
    let mainQuestionnaire = {
      id: questionnaireId,
      title: "",
      description: "",
      questions: null,
    };

    try {
      const [questionnaireRows] = await pool.query(
        `SELECT id, title, description, questions FROM questionnaire_config WHERE id = ?`,
        [questionnaireId]
      );

      if (questionnaireRows.length > 0) {
        mainQuestionnaire.title =
          questionnaireRows[0].title || "Untitled Questionnaire";
        mainQuestionnaire.description = questionnaireRows[0].description || "";

        // Parse questions JSON
        if (questionnaireRows[0].questions) {
          try {
            mainQuestionnaire.questions =
              typeof questionnaireRows[0].questions === "string"
                ? JSON.parse(questionnaireRows[0].questions)
                : questionnaireRows[0].questions;
          } catch (parseError) {
            console.error(
              "❌ Error parsing main questionnaire questions:",
              parseError
            );
            mainQuestionnaire.questions = null;
          }
        }

        console.log(
          `✅ Fetched main questionnaire: ${mainQuestionnaire.title}`
        );
      } else {
        console.warn("⚠️ Main questionnaire not found");
      }
    } catch (error) {
      console.error("❌ Error fetching main questionnaire:", error);
    }

    // ✅ STEP 3: FETCH REFERENCE QUESTIONNAIRES DATA
    let referenceQuestionnairesData = {};

    if (Object.keys(referenceQuestionnaires).length > 0) {
      console.log("🔍 Fetching reference questionnaires...");

      // Collect unique questionnaire IDs
      const uniqueQuestionnaireIds = new Set();

      for (const [sectionId, refs] of Object.entries(referenceQuestionnaires)) {
        if (Array.isArray(refs)) {
          refs.forEach((ref) => {
            if (ref.questionnaireId) {
              uniqueQuestionnaireIds.add(ref.questionnaireId);
            }
          });
        }
      }

      // Fetch each unique reference questionnaire
      for (const refQId of uniqueQuestionnaireIds) {
        try {
          const [refQuestionnaireRows] = await pool.query(
            `SELECT id, title, description, questions FROM questionnaire_config WHERE id = ?`,
            [refQId]
          );

          if (refQuestionnaireRows.length > 0) {
            let refQuestions = null;

            if (refQuestionnaireRows[0].questions) {
              try {
                refQuestions =
                  typeof refQuestionnaireRows[0].questions === "string"
                    ? JSON.parse(refQuestionnaireRows[0].questions)
                    : refQuestionnaireRows[0].questions;
              } catch (parseError) {
                console.error(
                  `❌ Error parsing questions for ref questionnaire ${refQId}:`,
                  parseError
                );
              }
            }

            referenceQuestionnairesData[refQId] = {
              id: refQId,
              title: refQuestionnaireRows[0].title || "Untitled",
              description: refQuestionnaireRows[0].description || "",
              questions: refQuestions,
            };

            console.log(
              `✅ Fetched reference questionnaire: ${referenceQuestionnairesData[refQId].title}`
            );
          }
        } catch (error) {
          console.error(
            `❌ Error fetching reference questionnaire ${refQId}:`,
            error
          );
        }
      }
    }

    // ✅ STEP 4: PARSE SECTIONS DATA
    let parsedSectionsData;
    try {
      parsedSectionsData =
        typeof sectionsData === "string"
          ? JSON.parse(sectionsData)
          : sectionsData || {};
    } catch (error) {
      console.error("❌ Error parsing sections_data:", error);
      parsedSectionsData = {};
    }

    // ✅ STEP 5: GENERATE AI RESPONSE
    let generatedAIResponse = null;

    try {
      console.log("🤖 Generating updated AI response preview...");

      // Build section requirements for the prompt
      let sectionRequirements = "";

      if (parsedSectionsData.text && Array.isArray(parsedSectionsData.text)) {
        sectionRequirements += "\nTEXT SECTIONS:\n";
        parsedSectionsData.text.forEach((section) => {
          sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}"`;
          if (section.prompt)
            sectionRequirements += `, Instructions: "${section.prompt}"`;
          sectionRequirements += "\n";
        });
      }

      if (
        parsedSectionsData.charts &&
        Array.isArray(parsedSectionsData.charts)
      ) {
        sectionRequirements += "\nCHART SECTIONS:\n";
        parsedSectionsData.charts.forEach((section) => {
          sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"`;
          if (section.prompt)
            sectionRequirements += `, Instructions: "${section.prompt}"`;
          sectionRequirements += "\n";
        });
      }

      if (
        parsedSectionsData.tables &&
        Array.isArray(parsedSectionsData.tables)
      ) {
        sectionRequirements += "\nTABLE SECTIONS:\n";
        parsedSectionsData.tables.forEach((section) => {
          sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"`;
          if (section.prompt)
            sectionRequirements += `, Instructions: "${section.prompt}"`;
          sectionRequirements += "\n";
        });
      }

      // Sample test data for AI preview
      const testResponses = {
        sample: "This is sample test data to generate a preview response",
      };

      const finalPrompt = `You are an expert report generation AI assistant. Create a professional, comprehensive report in JSON format.

CONTEXT AND INSTRUCTIONS:
${finalSystemPrompt}
${
  finalPromptPrincipale
    ? `\nAdditional Guidelines: ${finalPromptPrincipale}`
    : ""
}

USER INPUT DATA (SAMPLE):
${JSON.stringify(testResponses, null, 2)}

REQUIRED SECTIONS TO GENERATE:
${sectionRequirements}

DETAILED GENERATION RULES:

1. TEXT SECTIONS:
   - Write substantive, professional content (minimum 150 words per section)
   - Write in clear paragraphs with proper structure

2. CHART SECTIONS:
   - Generate meaningful, realistic data
   - Use 3-7 data points with clear labels

3. TABLE SECTIONS:
   - Create descriptive, relevant headers (3-5 columns)
   - Generate 4-8 rows of meaningful data

OUTPUT FORMAT:
{
  "sections": [
    {
      "section_type": "text",
      "id": "1",
      "shortcode": "intro",
      "title": "Introduction",
      "content": "..."
    }
  ]
}

Generate the report now:`;

      // Call OpenAI API
      const aiResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a professional report generation AI. You MUST respond with ONLY valid JSON.",
            },
            {
              role: "user",
              content: finalPrompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 6000,
          response_format: { type: "json_object" },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      let aiContent = aiResponse.data.choices[0].message.content.trim();
      aiContent = aiContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      generatedAIResponse = JSON.parse(aiContent);
      console.log("✅ Updated AI response generated successfully");
    } catch (aiError) {
      console.error(
        "⚠️ Failed to generate updated AI response:",
        aiError.message
      );
      // Continue without AI response if it fails
    }

    // ✅ STEP 6: BUILD COMPLETE AI RESPONSE DATA STRUCTURE
    const completeAIResponseData = {
      metadata: {
        generated_at: new Date().toISOString(),
        version: "1.0",
      },
      prompt_structure: {
        system_prompt: finalSystemPrompt,
        main_prompt: finalPromptPrincipale,
        sections_data: parsedSectionsData,
        reference_questionnaires: referenceQuestionnaires,
      },
      main_questionnaire: {
        id: mainQuestionnaire.id,
        title: mainQuestionnaire.title,
        description: mainQuestionnaire.description,
        questions: mainQuestionnaire.questions,
      },
      reference_questionnaires_data: referenceQuestionnairesData,
      ai_generated_response: generatedAIResponse,
    };

    console.log("📦 Complete updated AI response data structure created");

    // ✅ STEP 7: UPDATE THE RECORD WITH AI RESPONSE
    const updateQuery = `
      UPDATE prompt_templates SET 
        title = ?, 
        content = ?, 
        system_prompt = ?, 
        variables = ?, 
        sequence_index = ?, 
        sections_data = ?, 
        report_template = ?, 
        reference_questionnaires = ?,
        ai_response = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    const [result] = await pool.execute(updateQuery, [
      title,
      finalPromptPrincipale,
      finalSystemPrompt,
      JSON.stringify(variables || []),
      sequence_index || 0,
      JSON.stringify(sectionsData),
      finalTemplateStructure,
      JSON.stringify(referenceQuestionnaires),
      JSON.stringify(completeAIResponseData),
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Prompt template not found",
      });
    }

    console.log("✅ Updated in prompt_templates table for ID:", id);

    res.json({
      success: true,
      message: "Prompt template updated successfully with new AI response",
      data: {
        id: id,
        ai_response: completeAIResponseData,
      },
    });
  } catch (error) {
    console.error("❌ Error updating prompt template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update prompt template",
      error: error.message,
    });
  }
});

// Delete prompt template
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete from prompt_templates
    const [result] = await pool.query(
      "DELETE FROM prompt_templates WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Prompt template not found",
      });
    }

    res.json({
      success: true,
      message: "Prompt template deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting prompt template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete prompt template",
    });
  }
});

// Get report_template for a specific questionnaire_id
router.get("/template/:questionnaireId", async (req, res) => {
  try {
    const { questionnaireId } = req.params;

    // Fetch the report_template for the given questionnaire_id
    const [rows] = await pool.query(
      `SELECT report_template FROM prompt_templates WHERE questionnaire_id = ?`,
      [questionnaireId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report template not found",
      });
    }

    res.json({
      success: true,
      reportTemplate: rows[0].report_template,
    });
  } catch (error) {
    console.error("Error fetching report template:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report template",
    });
  }
});

export default router;
