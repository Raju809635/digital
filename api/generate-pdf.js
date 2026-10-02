import generatePDF from '../generatePdf.cjs';

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST to download a PDF.' });
  const { title, subject, answers, revision = false } = request.body || {};
  if (!Array.isArray(answers) || !answers.length) return response.status(400).json({ error: 'There are no answers to download.' });
  if (answers.length > 12) return response.status(400).json({ error: 'Download up to 12 answers at a time.' });
  try {
    const pdf = await generatePDF({ title: title || subject || 'Exam Answer Notes', answers }, undefined, { revision: Boolean(revision) });
    const filename = revision ? 'digital-orbit-revision.pdf' : 'digital-orbit-handwritten-answers.pdf';
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', pdf.length);
    return response.status(200).send(pdf);
  } catch (error) {
    console.error('[generate-pdf]', error.stack || error.message);
    const diagnostic = String(error.code || error.name || 'PDF_ERROR');
    const details = String(error.message || 'Unknown PDF generation error').replace(/[A-Z]:\\[^\s]+|\/var\/task\/[^\s]+/g, '[server path]').slice(0, 180);
    return response.status(500).json({ error: 'Could not create the PDF.', diagnostic, details });
  }
}
