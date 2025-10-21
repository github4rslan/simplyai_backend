import express from "express";
const router = express.Router();
import { pool } from "../db.js";
import axios from "axios";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

// For ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../uploads/pdfs");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to generate PDF with better formatting
const generatePDF = async (data, reportId) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("📄 Starting PDF generation for report:", reportId);

      const { title, sections } = data;

      // Validate we have sections
      if (!sections || !Array.isArray(sections) || sections.length === 0) {
        throw new Error("No sections provided for PDF generation");
      }

      console.log(`📄 Generating PDF with ${sections.length} sections`);

      // Create PDF document with better settings
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        bufferPages: true,
        autoFirstPage: true,
      });

      // Setup file path
      const fileName = `report_${reportId}_${Date.now()}.pdf`;
      const uploadsDir = path.join(process.cwd(), "uploads", "pdfs");
      const filePath = path.join(uploadsDir, fileName);

      // Ensure directory exists
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log("📁 Created uploads directory:", uploadsDir);
      }

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // ✅ PDF HEADER with better styling
      doc
        .fontSize(26)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text(title, {
          align: "center",
        })
        .moveDown(0.5);

      // Decorative line
      doc
        .strokeColor("#3498db")
        .lineWidth(2)
        .moveTo(100, doc.y)
        .lineTo(doc.page.width - 100, doc.y)
        .stroke()
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#666666")
        .text(
          `Generated on: ${new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`,
          {
            align: "center",
          }
        )
        .moveDown(3);

      // ✅ RENDER EACH SECTION with improved formatting
      sections.forEach((section, index) => {
        console.log(
          `📄 Rendering section ${index + 1}/${sections.length}: ${
            section.title
          } (${section.section_type})`
        );

        // FIXED: Only add page if there's really not enough space (less than 10 points)
        // This prevents unnecessary blank pages
        if (doc.y > doc.page.height - 10 && index > 0) {
          doc.addPage();
        }

        // Section number and title - render at current position
        const sectionNumber = index + 1;
        const currentY = doc.y; // Store current Y position

        doc
          .fontSize(18)
          .font("Helvetica-Bold")
          .fillColor("#2c3e50")
          .text(
            `${sectionNumber}. ${section.title || `Section ${sectionNumber}`}`,
            50, // Explicit X coordinate for alignment
            currentY,
            {
              continued: false,
              align: "left",
            }
          )
          .moveDown(0.8);

        // Reset color for content
        doc.fillColor("#000000");

        // ✅ RENDER BASED ON SECTION TYPE
        try {
          switch (section.section_type) {
            case "text":
              renderTextSection(doc, section);
              break;

            case "chart":
            case "graph":
              renderChartSection(doc, section);
              break;

            case "table":
              renderTableSection(doc, section);
              break;

            default:
              doc
                .fontSize(10)
                .font("Helvetica-Oblique")
                .fillColor("#999999")
                .text(`[Section type "${section.section_type}" not recognized]`)
                .fillColor("#000000")
                .moveDown();
          }
        } catch (renderError) {
          console.error(
            `❌ Error rendering section ${index + 1}:`,
            renderError
          );
          doc
            .fontSize(10)
            .font("Helvetica")
            .fillColor("#e74c3c")
            .text(`[Error rendering this section: ${renderError.message}]`)
            .fillColor("#000000");
        }

        doc.moveDown(2);
      });

      // ✅ ADD FOOTER TO ALL PAGES - FIXED: Only process actual pages with content
      const range = doc.bufferedPageRange();
      const pageCount = range.count;

      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        // Footer line
        const footerY = doc.page.height - 60;
        doc
          .strokeColor("#cccccc")
          .lineWidth(0.5)
          .moveTo(50, footerY)
          .lineTo(doc.page.width - 50, footerY)
          .stroke();

        // Page number
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#888888")
          .text(`Page ${i + 1} of ${pageCount}`, 50, footerY + 10, {
            align: "center",
            width: doc.page.width - 100,
          });
      }

      // Finalize PDF
      doc.end();

      writeStream.on("finish", () => {
        const pdfUrl = `/uploads/pdfs/${fileName}`;
        console.log("✅ PDF file written successfully:", filePath);
        console.log("✅ PDF URL:", pdfUrl);
        resolve({ pdfUrl, filePath });
      });

      writeStream.on("error", (error) => {
        console.error("❌ Error writing PDF file:", error);
        reject(error);
      });
    } catch (error) {
      console.error("❌ Error in PDF generation:", error);
      reject(error);
    }
  });
};

// ✅ HELPER FUNCTION: Render Text Section with better formatting
function renderTextSection(doc, section) {
  const content = section.content || "No content available";

  // Split into paragraphs
  const paragraphs = content.split("\n").filter((p) => p.trim().length > 0);

  paragraphs.forEach((paragraph, idx) => {
    // Check if we need a new page
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
    }

    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor("#333333")
      .text(paragraph.trim(), {
        align: "justify",
        lineGap: 5,
        paragraphGap: 8,
      });

    if (idx < paragraphs.length - 1) {
      doc.moveDown(0.5);
    }
  });
}

// ✅ HELPER FUNCTION: Render Chart Section with visual representation
function renderChartSection(doc, section) {
  const chartType = (section.type || "bar").toLowerCase();

  // Chart info box
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#3498db")
    .text(`📊 Chart Type: ${chartType.toUpperCase()}`, {
      continued: false,
    })
    .fillColor("#000000")
    .moveDown(0.8);

  if (section.data && section.data.labels && section.data.values) {
    const labels = section.data.labels;
    const values = section.data.values;

    // Draw a simple visual representation
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Data Points:")
      .font("Helvetica")
      .moveDown(0.5);

    const maxValue = Math.max(...values);
    const barWidth = 300;

    labels.forEach((label, idx) => {
      const value = values[idx] || 0;
      const barLength = maxValue > 0 ? (value / maxValue) * barWidth : 0;

      // Check if we need a new page
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      // Label
      doc.fontSize(10).font("Helvetica").text(`${label}:`, 70, doc.y, {
        width: 150,
        continued: false,
      });

      const barY = doc.y - 12;

      // Draw bar
      doc.rect(230, barY, barLength, 15).fillAndStroke("#3498db", "#2980b9");

      // Value text
      doc
        .fontSize(10)
        .fillColor("#000000")
        .text(value.toLocaleString(), 230 + barLength + 10, barY + 2, {
          width: 100,
        });

      doc.moveDown(0.3);
    });
  } else {
    doc
      .fontSize(10)
      .fillColor("#e74c3c")
      .text("⚠ No chart data available")
      .fillColor("#000000");
  }
}

// ✅ HELPER FUNCTION: Render Table Section with enhanced styling
function renderTableSection(doc, section) {
  if (!section.headers || !section.rows || section.rows.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#e74c3c")
      .text("⚠ No table data available")
      .fillColor("#000000");
    return;
  }

  const headers = section.headers;
  const rows = section.rows;

  // Calculate column widths dynamically
  const tableWidth = doc.page.width - 100;
  const colWidth = tableWidth / headers.length;
  const startX = 50;
  const rowHeight = 30;
  const headerHeight = 35;
  let currentY = doc.y;

  // Check if table fits on current page
  const estimatedTableHeight = headerHeight + rows.length * rowHeight;
  if (currentY + estimatedTableHeight > doc.page.height - 100) {
    doc.addPage();
    currentY = doc.y; // FIXED: Use doc.y instead of hardcoded value
  }

  // ✅ Draw header row with gradient-like effect
  doc.fontSize(10).font("Helvetica-Bold");

  headers.forEach((header, idx) => {
    const x = startX + idx * colWidth;

    // Header background
    doc
      .rect(x, currentY, colWidth, headerHeight)
      .fillAndStroke("#34495e", "#2c3e50");

    // Header text
    doc
      .fillColor("#ffffff")
      .text(
        String(header).toUpperCase(),
        x + 8,
        currentY + (headerHeight - 10) / 2,
        {
          width: colWidth - 16,
          align: "center",
          ellipsis: true,
        }
      );
  });

  currentY += headerHeight;
  doc.fillColor("#000000");

  // ✅ Draw data rows with alternating colors
  doc.font("Helvetica").fontSize(9);

  rows.forEach((row, rowIdx) => {
    // Check if we need a new page
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = doc.y; // FIXED: Use doc.y for new page

      // Redraw headers on new page
      doc.fontSize(10).font("Helvetica-Bold");
      headers.forEach((header, idx) => {
        const x = startX + idx * colWidth;
        doc
          .rect(x, currentY, colWidth, headerHeight)
          .fillAndStroke("#34495e", "#2c3e50")
          .fillColor("#ffffff")
          .text(
            String(header).toUpperCase(),
            x + 8,
            currentY + (headerHeight - 10) / 2,
            {
              width: colWidth - 16,
              align: "center",
              ellipsis: true,
            }
          );
      });
      currentY += headerHeight;
      doc.fillColor("#000000").font("Helvetica").fontSize(9);
    }

    // Row background with alternating colors
    const fillColor = rowIdx % 2 === 0 ? "#ffffff" : "#f8f9fa";

    row.forEach((cell, cellIdx) => {
      const x = startX + cellIdx * colWidth;

      // Cell background
      doc
        .rect(x, currentY, colWidth, rowHeight)
        .fillAndStroke(fillColor, "#dee2e6");

      // Cell text
      doc
        .fillColor("#000000")
        .text(String(cell || "-"), x + 8, currentY + (rowHeight - 10) / 2, {
          width: colWidth - 16,
          align: "left",
          ellipsis: true,
        });
    });

    currentY += rowHeight;
  });

  // FIXED: Properly update doc.y after table rendering
  doc.y = currentY + 10;
}
// Method to get reference questionnaires with questions and answers
const getQuestionsAndAnswers = async (referenceData, userId) => {
  try {
    if (!referenceData) {
      return [];
    }

    const parsedData =
      typeof referenceData === "string"
        ? JSON.parse(referenceData)
        : referenceData;

    console.log("Parsed reference data structure:", parsedData);

    if (!parsedData || Object.keys(parsedData).length === 0) {
      return [];
    }

    const questionnaireIds = new Set();
    const questionnaireShortcodes = {};

    Object.values(parsedData).forEach((questionnaires) => {
      if (Array.isArray(questionnaires)) {
        questionnaires.forEach((ref) => {
          if (ref.questionnaireId) {
            questionnaireIds.add(ref.questionnaireId);

            if (!questionnaireShortcodes[ref.questionnaireId]) {
              questionnaireShortcodes[ref.questionnaireId] = [];
            }
            questionnaireShortcodes[ref.questionnaireId].push({
              shortcode: ref.shortcode,
              sectionType: ref.sectionType,
            });
          }
        });
      }
    });

    console.log("Questionnaire Shortcodes Mapping:", questionnaireShortcodes);

    if (questionnaireIds.size === 0) {
      return [];
    }

    console.log("Extracted Questionnaire IDs:", Array.from(questionnaireIds));

    const questionnaireIdsArray = Array.from(questionnaireIds);
    const placeholders = questionnaireIdsArray.map(() => "?").join(",");

    const [results] = await pool.query(
      `SELECT 
        qc.id as questionnaire_id,
        qc.title as questionnaire_title,
        qc.questions,
        qr.answers as answers
       FROM questionnaire_config qc
       LEFT JOIN questionnaire_responses qr ON qc.id = qr.questionnaire_id AND qr.user_id = ?
       WHERE qc.id IN (${placeholders})
       ORDER BY qc.id`,
      [userId, ...questionnaireIdsArray]
    );

    return results.map((row) => ({
      questionnaire_id: row.questionnaire_id,
      questionnaire_title: row.questionnaire_title,
      questions:
        typeof row.questions === "string"
          ? JSON.parse(row.questions)
          : row.questions,
      answers: row.answers
        ? typeof row.answers === "string"
          ? JSON.parse(row.answers)
          : row.answers
        : null,
      shortcodes: questionnaireShortcodes[row.questionnaire_id] || [],
    }));
  } catch (error) {
    console.error("Error in getQuestionsAndAnswers:", error);
    return [];
  }
};

router.post("/generate", async (req, res) => {
  try {
    const { questionnaireId, planId, responses, userId, title } = req.body;

    console.log("Received Request Body:", {
      questionnaireId,
      planId,
      userId,
    });

    // Validation
    if (!questionnaireId || !planId) {
      return res.status(400).json({
        success: false,
        message: "Questionnaire ID and Plan ID are required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // ✅ STEP 1: Fetch the questionnaire_response_id
    const [responseRows] = await pool.query(
      `SELECT id FROM questionnaire_responses 
       WHERE questionnaire_id = ? AND user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [questionnaireId, userId]
    );

    let questionnaireResponseId = null;
    if (responseRows.length > 0) {
      questionnaireResponseId = responseRows[0].id;
      console.log("Found questionnaire_response_id:", questionnaireResponseId);
    } else {
      console.log(
        "No questionnaire response found for this user and questionnaire"
      );
    }

    // ✅ STEP 2: Fetch prompt template data
    const [promptRows] = await pool.query(
      `SELECT id, system_prompt, content AS general_prompt, sections_data, 
              report_template AS template_structure, reference_questionnaires
       FROM prompt_templates
       WHERE questionnaire_id = ? AND plan_id = ?`,
      [questionnaireId, planId]
    );

    console.log("Database query result:", promptRows);

    if (promptRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No prompt data found for the given questionnaire and plan ID",
      });
    }

    const {
      id: templateId,
      system_prompt,
      general_prompt,
      sections_data,
      template_structure,
      reference_questionnaires,
    } = promptRows[0];

    console.log("Using Template ID from database:", templateId);
    console.log("Using Questionnaire Response ID:", questionnaireResponseId);

    // Parse sections_data if it's a string
    let parsedSectionsData;
    try {
      parsedSectionsData =
        typeof sections_data === "string"
          ? JSON.parse(sections_data)
          : sections_data;
    } catch (error) {
      console.error("Error parsing sections_data:", error);
      parsedSectionsData = {};
    }

    // Get questions and answers for reference questionnaires
    const questionsAndAnswersData = await getQuestionsAndAnswers(
      reference_questionnaires,
      userId
    );
    console.log(
      "Retrieved Questions and Answers Data:",
      JSON.stringify(questionsAndAnswersData, null, 2)
    );

    // ✅ BUILD SECTION REQUIREMENTS
    let sectionRequirements = "";

    // Text sections
    if (parsedSectionsData.text && Array.isArray(parsedSectionsData.text)) {
      sectionRequirements += "\nTEXT SECTIONS:\n";
      parsedSectionsData.text.forEach((section) => {
        sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}"`;
        if (section.prompt)
          sectionRequirements += `, Instructions: "${section.prompt}"`;
        sectionRequirements += "\n";
      });
    }

    // Chart sections
    if (parsedSectionsData.charts && Array.isArray(parsedSectionsData.charts)) {
      sectionRequirements += "\nCHART SECTIONS:\n";
      parsedSectionsData.charts.forEach((section) => {
        sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"`;
        if (section.prompt)
          sectionRequirements += `, Instructions: "${section.prompt}"`;
        sectionRequirements += "\n";
      });
    }

    // Table sections
    if (parsedSectionsData.tables && Array.isArray(parsedSectionsData.tables)) {
      sectionRequirements += "\nTABLE SECTIONS:\n";
      parsedSectionsData.tables.forEach((section) => {
        sectionRequirements += `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"`;
        if (section.prompt)
          sectionRequirements += `, Instructions: "${section.prompt}"`;
        sectionRequirements += "\n";
      });
    }

    // ✅ ENHANCED PROMPT - More specific and structured
    const finalPrompt = `You are an expert report generation AI assistant. Create a professional, comprehensive report in JSON format.

CONTEXT AND INSTRUCTIONS:
${system_prompt || "Generate a professional analysis report."}
${general_prompt ? `\nAdditional Guidelines: ${general_prompt}` : ""}

USER INPUT DATA:
${JSON.stringify(responses, null, 2)}

${
  questionsAndAnswersData.length > 0
    ? `\nREFERENCE QUESTIONNAIRE RESPONSES (use this data when relevant to section shortcodes):
${JSON.stringify(questionsAndAnswersData, null, 2)}`
    : ""
}

REQUIRED SECTIONS TO GENERATE:
${sectionRequirements}

DETAILED GENERATION RULES:

1. TEXT SECTIONS:
   - Write substantive, professional content (minimum 150 words per section)
   - Analyze and interpret the user's responses
   - Use specific details from the data provided
   - Write in clear paragraphs with proper structure
   - Be insightful, not generic

2. CHART SECTIONS:
   - Generate meaningful, realistic data based on user responses
   - Use 3-7 data points with clear labels
   - Values should be realistic and contextually appropriate
   - For bar/column charts: use categorical data
   - For line charts: use time-series or sequential data
   - For pie charts: use percentage breakdowns that sum to 100

3. TABLE SECTIONS:
   - Create descriptive, relevant headers (3-5 columns recommended)
   - Generate 4-8 rows of meaningful data
   - Ensure data is relevant to the section's purpose
   - Use proper formatting for numbers, dates, etc.
   - Make data specific, not placeholder text

4. SHORTCODE MATCHING:
   - Use the EXACT shortcode specified for each section
   - Use the EXACT id specified for each section
   - If reference questionnaire data has matching shortcodes, incorporate that information
   - Maintain the sequence and structure defined above

OUTPUT FORMAT REQUIREMENTS:
- Return ONLY a valid JSON object
- NO markdown code blocks (no \`\`\`json)
- NO explanatory text before or after
- NO comments in the JSON
- Proper escaping of quotes and special characters

EXACT JSON STRUCTURE:
{
  "sections": [
    {
      "section_type": "text",
      "id": "1",
      "shortcode": "intro",
      "title": "Introduction",
      "content": "Write the complete text content here. Multiple paragraphs are fine. Be detailed and specific."
    },
    {
      "section_type": "chart",
      "id": "1",
      "shortcode": "chart_overview",
      "title": "Performance Overview",
      "type": "bar",
      "data": {
        "labels": ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"],
        "values": [85, 92, 88, 95]
      }
    },
    {
      "section_type": "table",
      "id": "1",
      "shortcode": "table_summary",
      "title": "Detailed Summary",
      "headers": ["Category", "Value", "Status", "Notes"],
      "rows": [
        ["Performance", "92%", "Excellent", "Above target"],
        ["Quality", "88%", "Good", "On track"],
        ["Efficiency", "95%", "Excellent", "Exceeds expectations"]
      ]
    }
  ]
}

Generate the complete professional report now:`;

    console.log("Sending request to OpenAI...");

    // Send the prompt to OpenAI with better parameters
    // Send the prompt to OpenAI with compatible parameters
    // Send the prompt to OpenAI with the latest model
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o", // ✅ Latest model with best JSON support
        messages: [
          {
            role: "system",
            content:
              "You are a professional report generation AI. You MUST respond with ONLY valid JSON. Never use markdown formatting, code blocks, or any text outside the JSON structure. Your JSON must be complete, properly formatted, and ready to parse.",
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

    console.log("✅ AI Response received");

    let aiContent = aiResponse.data.choices[0].message.content.trim();
    console.log(
      "Raw AI Content (first 500 chars):",
      aiContent.substring(0, 500)
    );

    // ✅ PARSE JSON RESPONSE
    let parsedAIContent;
    try {
      // Clean up any potential markdown artifacts
      aiContent = aiContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      parsedAIContent = JSON.parse(aiContent);
      console.log(
        `✅ Successfully parsed AI response with ${
          parsedAIContent.sections?.length || 0
        } sections`
      );
    } catch (parseError) {
      console.error("❌ Failed to parse AI response:", parseError);
      console.error("Raw content:", aiContent);
      return res.status(500).json({
        success: false,
        message: "AI returned invalid JSON format",
        error: parseError.message,
        rawResponse: aiContent.substring(0, 2000),
      });
    }

    // Validate the parsed response
    if (!parsedAIContent.sections || !Array.isArray(parsedAIContent.sections)) {
      console.error("❌ AI response missing 'sections' array");
      return res.status(500).json({
        success: false,
        message: "AI response missing required 'sections' array",
        rawResponse: parsedAIContent,
      });
    }

    if (parsedAIContent.sections.length === 0) {
      console.error("❌ AI returned empty sections array");
      return res.status(500).json({
        success: false,
        message: "AI returned no sections",
        rawResponse: parsedAIContent,
      });
    }

    console.log(`✅ AI generated ${parsedAIContent.sections.length} sections`);
    parsedAIContent.sections.forEach((section, idx) => {
      console.log(
        `  Section ${idx + 1}: ${section.section_type} - "${section.title}" (${
          section.shortcode
        })`
      );
    });

    // Get report template ID
    const [reportTemplateRows] = await pool.query(
      `SELECT id FROM report_templates 
       WHERE user_id = ? AND plan_id = ?`,
      [userId, planId]
    );

    const reportTemplateId =
      reportTemplateRows.length > 0 ? reportTemplateRows[0].id : null;
    console.log("Report Template ID:", reportTemplateId);

    // ✅ GENERATE UUID FOR NEW REPORT
    const newReportId = uuidv4();
    console.log("Generated new Report UUID:", newReportId);

    // ✅ STEP 3: Insert the report with UUID
    try {
      const [result] = await pool.query(
        `INSERT INTO reports 
         (id, user_id, questionnaire_response_id, questionnaire_id, title, content, pdf_url, template_id, ai_response, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          newReportId,
          userId,
          questionnaireResponseId,
          questionnaireId,
          title || "Generated Report",
          JSON.stringify(responses || []),
          null,
          reportTemplateId,
          JSON.stringify(parsedAIContent),
        ]
      );

      console.log("✅ Report inserted successfully");
      console.log("Affected rows:", result.affectedRows);
    } catch (insertError) {
      console.error("❌ Database INSERT error:", insertError);
      return res.status(500).json({
        success: false,
        message: "Failed to insert report into database",
        error: insertError.message,
        sqlMessage: insertError.sqlMessage,
      });
    }

    // ✅ Generate PDF
    let pdfUrl = null;
    try {
      console.log("Starting PDF generation...");

      const pdfResult = await generatePDF(
        {
          title: title || "Generated Report",
          sections: parsedAIContent.sections,
          responses: responses,
          userId: userId,
          reportId: newReportId,
        },
        newReportId
      );

      pdfUrl = pdfResult.pdfUrl;
      console.log("✅ PDF generated successfully:", pdfUrl);

      // Update the report with the PDF URL
      await pool.query(`UPDATE reports SET pdf_url = ? WHERE id = ?`, [
        pdfUrl,
        newReportId,
      ]);
      console.log("✅ Report updated with PDF URL");
    } catch (pdfError) {
      console.error("❌ Error generating PDF:", pdfError);
      console.error("PDF Error stack:", pdfError.stack);
      // Continue without PDF - don't fail the entire request
    }

    // ✅ SUCCESS RESPONSE
    res.json({
      success: true,
      reportId: newReportId,
      pdfUrl: pdfUrl,
      templateId: templateId,
      questionnaireResponseId: questionnaireResponseId,
      sectionsGenerated: parsedAIContent.sections.length,
      sections: parsedAIContent.sections.map((s) => ({
        type: s.section_type,
        id: s.id,
        shortcode: s.shortcode,
        title: s.title,
      })),
    });
  } catch (error) {
    console.error("❌ Error in AI integration:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});
// ✅ Add endpoint to serve PDF files
router.get("/pdf/:reportId", async (req, res) => {
  try {
    console.log("Request for PDF with params:", req.params);
    const { reportId } = req.params;

    const [rows] = await pool.query(
      "SELECT pdf_url, title FROM reports WHERE id = ?",
      [reportId]
    );

    if (rows.length === 0 || !rows[0].pdf_url) {
      return res.status(404).json({
        success: false,
        message: "PDF not found",
      });
    }

    const pdfPath = path.join(__dirname, "..", rows[0].pdf_url);

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: "PDF file not found on server",
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${rows[0].title || "report"}.pdf"`
    );

    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error serving PDF:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving PDF",
    });
  }
});

// ✅ Add endpoint to regenerate PDF for existing report
router.post("/regenerate-pdf/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;

    const [rows] = await pool.query(
      "SELECT title, ai_response, content FROM reports WHERE id = ?",
      [reportId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const report = rows[0];

    // Generate PDF
    const pdfResult = await generatePDF(
      {
        title: report.title,
        aiContent: report.ai_response,
        responses:
          typeof report.content === "string"
            ? JSON.parse(report.content)
            : report.content,
      },
      reportId
    );

    // Update the report with the new PDF URL
    await pool.query("UPDATE reports SET pdf_url = ? WHERE id = ?", [
      pdfResult.pdfUrl,
      reportId,
    ]);

    res.json({
      success: true,
      pdfUrl: pdfResult.pdfUrl,
      message: "PDF regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating PDF:", error);
    res.status(500).json({
      success: false,
      message: "Error regenerating PDF",
      error: error.message,
    });
  }
});

export default router;
