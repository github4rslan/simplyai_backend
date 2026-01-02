import express from "express";
import axios from "axios";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../uploads");
const pdfUploadDir = path.join(uploadsRoot, "pdfs");

if (!fs.existsSync(pdfUploadDir)) {
  fs.mkdirSync(pdfUploadDir, { recursive: true });
}

const parseJson = (value, fallback = null) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
};

const buildSectionRequirements = (sectionsData = {}) => {
  const parts = [];

  if (Array.isArray(sectionsData.text)) {
    parts.push("TEXT SECTIONS:");
    sectionsData.text.forEach((section) => {
      parts.push(
        `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}"${section.prompt ? `, Instructions: "${section.prompt}"` : ""}`
      );
    });
  }

  if (Array.isArray(sectionsData.charts)) {
    parts.push("", "CHART SECTIONS:");
    sectionsData.charts.forEach((section) => {
      parts.push(
        `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"${section.prompt ? `, Instructions: "${section.prompt}"` : ""}`
      );
    });
  }

  if (Array.isArray(sectionsData.tables)) {
    parts.push("", "TABLE SECTIONS:");
    sectionsData.tables.forEach((section) => {
      parts.push(
        `- ID: "${section.id}", Title: "${section.title}", Shortcode: "${section.shortcode}", Type: "${section.type}"${section.prompt ? `, Instructions: "${section.prompt}"` : ""}`
      );
    });
  }

  return parts.join("\n");
};

const renderTextSection = (doc, section) => {
  const content = section.content || "No content available";
  const paragraphs = content.split("\n").filter((p) => p.trim().length > 0);

  paragraphs.forEach((paragraph, idx) => {
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
};

const renderChartSection = (doc, section) => {
  const chartType = (section.type || "bar").toLowerCase();

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#3498db")
    .text(`Chart Type: ${chartType.toUpperCase()}`)
    .fillColor("#000000")
    .moveDown(0.8);

  const labels = section.data?.labels || [];
  const values = section.data?.values || [];

  if (labels.length === 0 || values.length === 0) {
    doc
      .fontSize(10)
      .fillColor("#e74c3c")
      .text("No chart data available")
      .fillColor("#000000");
    return;
  }

  const maxValue = Math.max(...values);
  const barWidth = 300;

  labels.forEach((label, idx) => {
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
    }

    const value = values[idx] || 0;
    const barLength = maxValue > 0 ? (value / maxValue) * barWidth : 0;

    doc.fontSize(10).font("Helvetica").text(`${label}:`, 70, doc.y, {
      width: 150,
    });

    const barY = doc.y - 12;
    doc.rect(230, barY, barLength, 15).fillAndStroke("#3498db", "#2980b9");

    doc
      .fontSize(10)
      .fillColor("#000000")
      .text(value.toLocaleString(), 230 + barLength + 10, barY + 2, {
        width: 100,
      });

    doc.moveDown(0.3);
  });
};

const renderTableSection = (doc, section) => {
  if (!Array.isArray(section.headers) || !Array.isArray(section.rows)) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#e74c3c")
      .text("No table data available")
      .fillColor("#000000");
    return;
  }

  const headers = section.headers;
  const rows = section.rows;
  const tableWidth = doc.page.width - 100;
  const colWidth = tableWidth / headers.length;
  const startX = 50;
  const rowHeight = 30;
  const headerHeight = 35;
  let currentY = doc.y;

  const estimatedTableHeight = headerHeight + rows.length * rowHeight;
  if (currentY + estimatedTableHeight > doc.page.height - 100) {
    doc.addPage();
    currentY = doc.y;
  }

  doc.fontSize(10).font("Helvetica-Bold");

  headers.forEach((header, idx) => {
    const x = startX + idx * colWidth;

    doc.rect(x, currentY, colWidth, headerHeight).fillAndStroke("#34495e", "#2c3e50");

    doc
      .fillColor("#ffffff")
      .text(String(header).toUpperCase(), x + 8, currentY + (headerHeight - 10) / 2, {
        width: colWidth - 16,
        align: "center",
        ellipsis: true,
      });
  });

  currentY += headerHeight;
  doc.fillColor("#000000").font("Helvetica").fontSize(9);

  rows.forEach((row, rowIdx) => {
    if (currentY > doc.page.height - 100) {
      doc.addPage();
      currentY = doc.y;

      doc.fontSize(10).font("Helvetica-Bold");
      headers.forEach((header, idx) => {
        const x = startX + idx * colWidth;
        doc
          .rect(x, currentY, colWidth, headerHeight)
          .fillAndStroke("#34495e", "#2c3e50")
          .fillColor("#ffffff")
          .text(String(header).toUpperCase(), x + 8, currentY + (headerHeight - 10) / 2, {
            width: colWidth - 16,
            align: "center",
            ellipsis: true,
          });
      });
      currentY += headerHeight;
      doc.fillColor("#000000").font("Helvetica").fontSize(9);
    }

    const fillColor = rowIdx % 2 === 0 ? "#ffffff" : "#f8f9fa";

    row.forEach((cell, cellIdx) => {
      const x = startX + cellIdx * colWidth;

      doc.rect(x, currentY, colWidth, rowHeight).fillAndStroke(fillColor, "#dee2e6");

      doc
        .fillColor("#000000")
        .text(String(cell ?? "-"), x + 8, currentY + (rowHeight - 10) / 2, {
          width: colWidth - 16,
          align: "left",
          ellipsis: true,
        });
    });

    currentY += rowHeight;
  });

  doc.y = currentY + 10;
};

const generatePDF = async (data, reportId) => {
  return new Promise((resolve, reject) => {
    try {
      const { title, sections } = data;

      if (!Array.isArray(sections) || sections.length === 0) {
        return reject(new Error("No sections provided for PDF generation"));
      }

      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        bufferPages: true,
        autoFirstPage: true,
      });

      const fileName = `report_${reportId}_${Date.now()}.pdf`;
      const filePath = path.join(pdfUploadDir, fileName);

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      doc
        .fontSize(26)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text(title || "Report", { align: "center" })
        .moveDown(0.5);

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
          { align: "center" }
        )
        .moveDown(3);

      sections.forEach((section, index) => {
        if (doc.y > doc.page.height - 10 && index > 0) {
          doc.addPage();
        }

        const sectionNumber = index + 1;
        const currentY = doc.y;

        doc
          .fontSize(18)
          .font("Helvetica-Bold")
          .fillColor("#2c3e50")
          .text(
            `${sectionNumber}. ${section.title || `Section ${sectionNumber}`}`,
            50,
            currentY,
            { align: "left" }
          )
          .moveDown(0.8)
          .fillColor("#000000");

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
                .text(`Section type "${section.section_type}" not recognized`)
                .fillColor("#000000")
                .moveDown();
          }
        } catch (renderError) {
          doc
            .fontSize(10)
            .font("Helvetica")
            .fillColor("#e74c3c")
            .text(`Error rendering this section: ${renderError.message}`)
            .fillColor("#000000");
        }

        doc.moveDown(2);
      });

      const range = doc.bufferedPageRange();
      const pageCount = range.count;

      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        const footerY = doc.page.height - 60;
        doc
          .strokeColor("#cccccc")
          .lineWidth(0.5)
          .moveTo(50, footerY)
          .lineTo(doc.page.width - 50, footerY)
          .stroke();

        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#888888")
          .text(`Page ${i + 1} of ${pageCount}`, 50, footerY + 10, {
            align: "center",
            width: doc.page.width - 100,
          });
      }

      doc.end();

      writeStream.on("finish", () => {
        const pdfUrl = `/uploads/pdfs/${fileName}`;
        resolve({ pdfUrl, filePath });
      });

      writeStream.on("error", (error) => reject(error));
    } catch (error) {
      reject(error);
    }
  });
};

const buildFinalPrompt = (systemPrompt, generalPrompt, responses, sectionRequirements, referenceData) => {
  return `You are an expert report generation AI assistant. Create a professional, comprehensive report in JSON format.

CONTEXT AND INSTRUCTIONS:
${systemPrompt || "Generate a professional analysis report."}
${generalPrompt ? `\nAdditional Guidelines: ${generalPrompt}` : ""}

USER INPUT DATA:
${JSON.stringify(responses, null, 2)}

${referenceData?.length ? `REFERENCE QUESTIONNAIRE RESPONSES (use when relevant to section shortcodes):\n${JSON.stringify(referenceData, null, 2)}` : ""}

REQUIRED SECTIONS TO GENERATE:
${sectionRequirements}

DETAILED GENERATION RULES:
1. TEXT SECTIONS: write at least 150 words, be specific, use paragraphs.
2. CHART SECTIONS: generate realistic 3-7 data points with clear labels.
3. TABLE SECTIONS: 3-5 columns, 4-8 rows, meaningful data.
4. SHORTCODE MATCHING: use provided ids and shortcodes exactly.

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

Generate the complete professional report now:`;
};

router.post("/generate", async (req, res) => {
  try {
    const { questionnaireId, planId, responses, userId, title } = req.body;

    if (!questionnaireId || !planId || !userId) {
      return res.status(400).json({
        success: false,
        message: "questionnaireId, planId, and userId are required",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY is not configured",
      });
    }

    const [responseRows] = await pool.query(
      `SELECT id FROM questionnaire_responses WHERE questionnaire_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [questionnaireId, userId]
    );

    const questionnaireResponseId = responseRows[0]?.id || null;

    const [promptRows] = await pool.query(
      `SELECT id, system_prompt, content AS general_prompt, sections_data, report_template AS template_structure, reference_questionnaires FROM prompt_templates WHERE questionnaire_id = ? AND plan_id = ?`,
      [questionnaireId, planId]
    );

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

    const parsedSectionsData = parseJson(sections_data, {});
    const questionsAndAnswersData = await (async () => {
      if (!reference_questionnaires) return [];

      const parsedData = parseJson(reference_questionnaires, {});
      if (!parsedData || Object.keys(parsedData).length === 0) return [];

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

      if (questionnaireIds.size === 0) return [];

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
        questions: parseJson(row.questions, row.questions),
        answers: row.answers ? parseJson(row.answers, row.answers) : null,
        shortcodes: questionnaireShortcodes[row.questionnaire_id] || [],
      }));
    })();

    const sectionRequirements = buildSectionRequirements(parsedSectionsData);
    const finalPrompt = buildFinalPrompt(
      system_prompt,
      general_prompt,
      responses,
      sectionRequirements,
      questionsAndAnswersData
    );

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
    aiContent = aiContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    const parsedAIContent = parseJson(aiContent, null);

    if (!parsedAIContent || !Array.isArray(parsedAIContent.sections)) {
      return res.status(500).json({
        success: false,
        message: "AI response missing required 'sections' array",
        rawResponse: aiContent.substring(0, 2000),
      });
    }

    const [reportTemplateRows] = await pool.query(
      `SELECT id FROM report_templates WHERE user_id = ? AND plan_id = ?`,
      [userId, planId]
    );
    const reportTemplateId = reportTemplateRows[0]?.id || null;

    const newReportId = uuidv4();

    await pool.query(
      `INSERT INTO reports 
         (id, user_id, questionnaire_response_id, questionnaire_id, title, content, pdf_url, template_id, ai_response, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        newReportId,
        userId,
        questionnaireResponseId,
        questionnaireId,
        title || "Generated Report",
        JSON.stringify(responses ?? {}),
        null,
        reportTemplateId,
        JSON.stringify(parsedAIContent),
      ]
    );

    let pdfUrl = null;
    let pdfError = null;

    try {
      const pdfResult = await generatePDF(
        {
          title: title || "Generated Report",
          sections: parsedAIContent.sections,
        },
        newReportId
      );

      pdfUrl = pdfResult.pdfUrl;
      await pool.query(`UPDATE reports SET pdf_url = ? WHERE id = ?`, [
        pdfUrl,
        newReportId,
      ]);
    } catch (error) {
      pdfError = error.message;
    }

    res.json({
      success: true,
      reportId: newReportId,
      pdfUrl,
      pdfError,
      templateId,
      questionnaireResponseId,
      sectionsGenerated: parsedAIContent.sections.length,
      sections: parsedAIContent.sections.map((s) => ({
        type: s.section_type,
        id: s.id,
        shortcode: s.shortcode,
        title: s.title,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.get("/pdf/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;

    const [rows] = await pool.query(
      "SELECT pdf_url, title FROM reports WHERE id = ?",
      [reportId]
    );

    if (rows.length === 0 || !rows[0].pdf_url) {
      return res.status(404).json({ success: false, message: "PDF not found" });
    }

    const sanitizedPath = rows[0].pdf_url.replace(/^[\/\\]+/, "");
    const pdfPath = path.resolve(__dirname, "..", sanitizedPath);

    if (!fs.existsSync(pdfPath)) {
      return res
        .status(404)
        .json({ success: false, message: "PDF file not found on server" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${rows[0].title || "report"}.pdf"`
    );

    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error retrieving PDF" });
  }
});

router.post("/regenerate-pdf/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;

    const [rows] = await pool.query(
      "SELECT title, ai_response FROM reports WHERE id = ?",
      [reportId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const aiData = parseJson(rows[0].ai_response, null);
    const sections = aiData?.sections || aiData?.data?.sections;

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No AI sections available to regenerate PDF",
      });
    }

    const pdfResult = await generatePDF(
      {
        title: rows[0].title,
        sections,
      },
      reportId
    );

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
    res.status(500).json({
      success: false,
      message: "Error regenerating PDF",
      error: error.message,
    });
  }
});

export default router;
