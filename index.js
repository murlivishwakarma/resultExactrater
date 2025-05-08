import puppeteer from "puppeteer";
import axios from "axios";
import { createWriteStream } from "fs";
import fs from "fs";
import FormData from "form-data";
import { writeTocsv, cleanupCsv } from "./csvwriter.js";
import cors from "cors";
import path from "path";
import bodyParser from "body-parser";
import chromeLauncher from "chrome-launcher";
import { fileURLToPath } from "url";
import multer from "multer";
import express from "express";

// Azure-compatible paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = process.env.WEBSITE_INSTANCE_ID ? "/tmp" : __dirname;

const app = express();
app.use(express.json());

// Azure requires PORT from environment variables
const PORT = process.env.PORT || 3000;

// Increased for Azure's headless browser requirements
import EventEmitter from "events";
EventEmitter.defaultMaxListeners = 20;

// Tightened CORS for production (adjust origin as needed)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(bodyParser.json());

// Azure-compatible server startup
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Modified for Azure temp storage
async function downloadImage(url, filename) {
  const filePath = path.join(tempDir, filename);
  const response = await axios({
    url,
    responseType: "stream",
  });
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    response.data.pipe(stream);
    stream.on("finish", () => resolve(filePath));
    stream.on("error", (error) => reject(error));
  });
}

// Updated CAPTCHA path for Azure
async function solveCaptcha(imageFilename) {
  try {
    const imagePath = path.join(tempDir, imageFilename);
    const formData = new FormData();
    formData.append("image", fs.createReadStream(imagePath));

    const response = await axios.post(
      process.env.CAPTCHA_SERVICE_URL ||
        "https://captcha-solver-api-fucaezhgcca0dwda.centralindia-01.azurewebsites.net/solve_captcha",
      formData,
      { headers: formData.getHeaders() }
    );
    return response.data.captcha_text;
  } catch (error) {
    console.error("Error solving CAPTCHA:", error);
    return "";
  }
}

// Azure-optimized browser launch
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
}

// (Keep all your existing functions: fun1, fun2, etc. exactly as-is)
const fun1 = async (roll, semester, instituteCode) => {
  let retryCount = 0;

  while (true) {
    // Infinite loop for retrying CAPTCHA
    try {
      const chrome = await chromeLauncher.launch({
        chromeFlags: ["--headless"],
      });

      const browser = await puppeteer.launch({
        headless: "new",
        executablePath: chrome.executablePath,
      });

      const page = await browser.newPage();

      const url = "http://result.rgpv.ac.in/Result/ProgramSelect.aspx";
      const roll_no = instituteCode + roll;

      console.log(`Processing roll ${roll_no} (Attempt ${retryCount + 1})`);

      // Handle alerts (e.g., "Result not found")
      let resultNotFound = false;
      page.on("dialog", async (dialog) => {
        const alertMessage = dialog.message();
        console.log(`Alert detected: ${alertMessage}`);

        if (alertMessage.includes("Result for this Enrollment No. not Found")) {
          resultNotFound = true; // Mark that the result was not found
        }
        await dialog.accept(); // Automatically click "OK"
        await browser.close();
      });

      await page.goto(url);

      // Select program
      await page.evaluate(() => {
        const radioButton = document.getElementById("radlstProgram_1");
        radioButton.checked = true;
        radioButton.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          })
        );
      });

      await page.waitForNavigation();

      // Enter roll number and semester
      await page.type("#ctl00_ContentPlaceHolder1_txtrollno", roll_no);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.select("#ctl00_ContentPlaceHolder1_drpSemester", semester);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Download and solve CAPTCHA
      await page.waitForSelector('img[src*="CaptchaImage.axd"]');
      const captchaImageSrc = await page.$eval(
        'img[src*="CaptchaImage.axd"]',
        (img) => img.src
      );
      const captchaFullUrl = captchaImageSrc.startsWith("http")
        ? captchaImageSrc
        : `${url}/${captchaImageSrc}`;
      await downloadImage(captchaFullUrl, "captcha.png");

      const captchaText = await solveCaptchaWithTimeout("captcha.png");
      const cleanedText = captchaText.replace(/\s+/g, "");
      console.log("Recognized CAPTCHA text:", cleanedText);

      await page.type("#ctl00_ContentPlaceHolder1_TextBox1", cleanedText);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Submit the form
      await page.click("#ctl00_ContentPlaceHolder1_btnviewresult");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if the result was not found
      if (resultNotFound) {
        console.log(`Result not found for roll ${roll_no}. Skipping...`);
        // await browser.close();
        return; // Exit the function but continue processing other roll numbers
      }

      // Check if the CAPTCHA was incorrect
      const errorMessage = await page.evaluate(() => {
        const errorElement = document.querySelector(
          "#ctl00_ContentPlaceHolder1_lblError"
        );
        return errorElement ? errorElement.innerText.trim() : "";
      });

      if (errorMessage.includes("Invalid CAPTCHA")) {
        throw new Error("CAPTCHA incorrect"); // Throw error to trigger retry
      }

      // Process the result if CAPTCHA is correct
      const resultData = await page.evaluate(() => {
        const nameElement = document.querySelector(
          "#ctl00_ContentPlaceHolder1_lblNameGrading"
        );
        const name = nameElement ? nameElement.innerText : "";

        const branchElement = document.querySelector(
          "#ctl00_ContentPlaceHolder1_lblBranchGrading"
        );
        const branch = branchElement ? branchElement.innerText : "";

        const tables = document.querySelectorAll(
          "#ctl00_ContentPlaceHolder1_pnlGrading .gridtable"
        );
        const subjects = [];
        const grades = [];

        tables.forEach((table, index) => {
          if (index >= 2) {
            // Start from index 2 and go till the last available table
            const rows = table.querySelectorAll("tr");

            rows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 4) {
                // Ensure it has at least 4 columns
                const subject = cells[0].textContent.trim();
                const grade = cells[3].textContent.trim();
                subjects.push(subject);
                grades.push(grade);
              }
            });
          }
        });

        const sgpa = document
          .getElementById("ctl00_ContentPlaceHolder1_lblSGPA")
          .textContent.trim();
        const cgpa = document
          .getElementById("ctl00_ContentPlaceHolder1_lblcgpa")
          .textContent.trim();
        const resultDesc = document
          .getElementById("ctl00_ContentPlaceHolder1_lblResultNewGrading")
          .textContent.trim();

        const subjectGrades = {};
        for (let i = 0; i < subjects.length; i++) {
          subjectGrades[subjects[i]] = grades[i]; // e.g., { BT101: 'A', BT102: 'B' }
        }

        return {
          name,
          branch,
          subjects,
          grades,
          sgpa,
          cgpa,
          resultDesc,
          subjectGrades,
        };
      });

      console.log("Result Data:", resultData);
      const subjectGrades = resultData.subjectGrades;
      // Write result to CSV
      const records = [
        {
          name: resultData.name,
          roll_no: roll_no,
          branch: resultData.branch,
          subjects: resultData.subjects, // Join subjects into a single string
          ...subjectGrades,
          grades: resultData.grades, // Join grades into a single string
          sgpa: resultData.sgpa,
          cgpa: resultData.cgpa,
          resultDesc: resultData.resultDesc,
        },
      ];

      const filePath = "results.csv";

      writeTocsv(records, resultData.subjects, filePath);

      await browser.close();
      return; // Exit the function on success
    } catch (error) {
      retryCount++;
      console.error(
        `Error processing roll ${roll} (Attempt ${retryCount}):`,
        error
      );

      // Wait for a short delay before retrying

      await new Promise((resolve) => setTimeout(resolve, 2000));
      // await browser.close();
    }
  }
};


 const fun2 = async (rollStart, rollEnd, semester, instituteCode) => {
   const concurrentProcesses = 10; // Adjust based on server capacity

   // Generate an array of roll numbers
   const rollNumbers = Array.from(
     { length: rollEnd - rollStart + 1 },
     (_, i) => rollStart + i
   );

   // Function to process a single roll number
   const processRoll = async (roll) => {
     while (true) {
       // Infinite loop to keep retrying
       try {
         await fun1(roll, semester, instituteCode);
         break; // Exit the loop if successful
       } catch (error) {
         // Check if the error is "Result for this Enrollment No. not Found"
         if (
           error.message.includes("Result for this Enrollment No. not Found")
         ) {
           console.log(`Result not found for roll ${roll}. Skipping...`);
           break; // Exit the loop for this roll number
         }

         // Log other errors and retry
         console.error(`Error processing roll ${roll}:`, error);
         console.log("Retrying...");

         // Wait for a short delay before retrying (e.g., 2 seconds)
         await new Promise((resolve) => setTimeout(resolve, 2000));
       }
     }
   };

   // Process roll numbers in batches
   for (let i = 0; i < rollNumbers.length; i += concurrentProcesses) {
     const batch = rollNumbers.slice(i, i + concurrentProcesses);
     await Promise.all(batch.map(processRoll));
   }

   console.log("Finished processing all roll numbers.");
   return;
 };


// Updated file paths in routes

app.post("/", async (req, res) => {
  try {
   

    // (Keep your existing processing logic)
     console.log("Received Request Body:", req.body);

     const roll = Number(req.body.rollStart);
     const rollEnd = Number(req.body.rollEnd);
     const semester = req.body.semester;
     const instituteCode = req.body.instituteCode;

     console.log("Processing Results:", {
       roll,
       rollEnd,
       semester,
       instituteCode,
     });

     await fun2(roll, rollEnd, semester, instituteCode);
     await new Promise((resolve) => setTimeout(resolve, 2000));

     const filePath = path.join(tempDir, "results.csv");

     // Set headers for file download
     res.setHeader("Content-Type", "text/csv");
     res.setHeader("Content-Disposition", 'attachment; filename="results.csv"');


    res.sendFile(filePath, (err) => {
      if (err) console.error("Send file error:", err);
      fs.unlink(filePath, () => {}); // Silent cleanup
    });
  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// Gemini setup with env variable
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});


  async function getFilteredResult(prompt) {
    const csvData = fs.readFileSync("result.csv", "utf8");

    const prompt1 = `
Here is a CSV table:

${csvData}

Task:
Handle User query in different way if required or Filter rows on the basis of prompt.
Return the result as a CSV table with an extra row for your remark on the query.
`;

    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt + prompt1,
    });

    const filteredCSV = result.candidates[0].content.parts[0].text;

    // Convert CSV to JSON
    const jsonResult = await csvtojson().fromString(filteredCSV);
    return jsonResult;
  }

  const convertToCSV = (data) => {
    const headers = Object.keys(data[0]).join(",") + "\n";
    const rows = data.map((obj) => Object.values(obj).join(",")).join("\n");
    return headers + rows;
  };

  app.post("/analyze", async (req, res) => {
    try {
      const prompt = req.body.prompt;
      const csvData = req.body.data;
      console.log("Received CSV Data:", csvData);

      const csv = convertToCSV(csvData);
      fs.writeFileSync(path.join(__dirname, "result.csv"), csv, "utf8");

      const data = await getFilteredResult(prompt);
      console.log(data);
      res.json(data);
    } catch (err) {
      res.status(500).send("Error processing data");
    }
  });

    
// (Keep your remaining routes and logic unchanged)
