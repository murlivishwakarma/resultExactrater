import createCsvWriter from "csv-writer";
import fs from "fs";
import path from "path";

// Azure-compatible file paths
const getTempDir = () =>
  process.env.WEBSITE_INSTANCE_ID ? "/tmp" : process.cwd();

function generateHeaders(subjectCodes) {
  const headers = [
    { id: "name", title: "Name" },
    { id: "roll_no", title: "Roll No." },
    { id: "branch", title: "Branch" },
  ];

  subjectCodes.forEach((code) => {
    headers.push({ id: code, title: code });
  });

  headers.push(
    { id: "sgpa", title: "SGPA" },
    { id: "cgpa", title: "CGPA" },
    { id: "resultDesc", title: "Result_Des" }
  );

  return headers;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    console.error("File existence check failed:", err);
    return false;
  }
}

async function writeTocsv(records, subjectCodes, filename) {
  const tempDir = getTempDir();
  const filePath = path.join(tempDir, filename);

  try {
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: filePath,
      header: generateHeaders(subjectCodes),
      append: fileExists(filePath),
      alwaysQuote: true, // Better Azure compatibility
    });

    await csvWriter.writeRecords(records);
    console.log(`CSV successfully written to ${filePath}`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("CSV write error:", err);
    throw new Error(`CSV write failed: ${err.message}`);
  }
}

// Azure-compatible file cleanup
async function cleanupCsv(filename) {
  const tempDir = getTempDir();
  const filePath = path.join(tempDir, filename);

  try {
    if (fileExists(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`Cleaned up CSV: ${filePath}`);
    }
  } catch (err) {
    console.error("CSV cleanup error:", err);
  }
}

export { writeTocsv, cleanupCsv };
