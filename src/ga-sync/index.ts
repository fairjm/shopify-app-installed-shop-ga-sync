import { BetaAnalyticsDataClient } from "@google-analytics/data";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { URL } from "url";
import fs from "fs/promises";
import path from "path";
import { format } from "date-fns";

// Load environment variables from .env file
dotenv.config();

const notSetStr = "(not set)";

// --- Configuration ---
const propertyId = process.env.GA_PROPERTY_ID;
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  // timezone: "+00:00",
};

// --- GA Client Initialization ---
// Ensure the JSON string is correctly parsed
let credentials;
try {
  if (!process.env.GA_CREDENTIALS_JSON) {
    throw new Error("GA_CREDENTIALS_JSON is not set in the .env file.");
  }
  credentials = JSON.parse(process.env.GA_CREDENTIALS_JSON);
} catch (error) {
  console.error(
    "Failed to parse GA_CREDENTIALS_JSON. Make sure it's a valid JSON object.",
    error
  );
  process.exit(1);
}

const analyticsDataClient = new BetaAnalyticsDataClient({
  credentials,
});

async function fetchGaReport(propertyId: string) {
  console.log("Fetching data from Google Analytics...");
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    dimensions: [
      { name: "countryId" },
      { name: "sessionSourceMedium" },
      { name: "landingPagePlusQueryString" },
      { name: "customEvent:shop_id" },
      { name: "dateHour" },
    ],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: "shopify_app_install" },
      },
    },
  });
  console.log(`Fetched ${response.rows?.length || 0} rows from GA.`);
  return response;
}

function processGaData(response: Awaited<ReturnType<typeof fetchGaReport>>) {
  if (!response.rows || response.rows.length === 0) {
    return [];
  }

  return response.rows.map((row) => {
    const dimensionValues = row.dimensionValues || [];
    const metricValues = row.metricValues || [];

    const landingPageWithQuery = dimensionValues[2]?.value || "";
    const parsedUrl = new URL(landingPageWithQuery, "https://example.com");
    const locale = parsedUrl.searchParams.get("locale") || notSetStr;
    const surfaceType = parsedUrl.searchParams.get("surface_type") || notSetStr;
    const surfaceDetail =
      parsedUrl.searchParams.get("surface_detail") || notSetStr;

    const dateHour = dimensionValues[4]?.value || "1970010100";
    const formattedDateTime = `${dateHour.substring(0, 4)}-${dateHour.substring(
      4,
      6
    )}-${dateHour.substring(6, 8)} ${dateHour.substring(8, 10)}:00:00`;

    return [
      dimensionValues[0]?.value || notSetStr,
      dimensionValues[1]?.value || notSetStr,
      landingPageWithQuery,
      dimensionValues[3]?.value || notSetStr,
      formattedDateTime,
      parseInt(metricValues[0]?.value || "0", 10),
      locale,
      surfaceType,
      surfaceDetail,
    ];
  });
}

async function saveToDatabase(
  connection: mysql.PoolConnection,
  data: (string | number)[][]
) {
  const tableName = "ga_app_installs";
  console.log(`Preparing to insert/update data into '${tableName}'...`);
  const insertQuery = `
        INSERT INTO ${tableName} (country_id, session_source_medium, landing_page, shop_id, event_datetime, event_count, locale, surface_type, surface_detail)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        event_count = VALUES(event_count),
        locale = VALUES(locale),
        surface_type = VALUES(surface_type),
        surface_detail = VALUES(surface_detail);
    `;
  await connection.query(insertQuery, [data]);
  console.log(
    `Successfully synced ${data.length} rows to the '${tableName}' table.`
  );
}

async function createCsvBackup(data: (string | number)[][]) {
  try {
    const now = new Date();
    const timestamp = format(now, "yyyyMMdd_HHmmss");
    const csvFileName = `${timestamp}.csv`;
    const csvDirectory = path.join(process.cwd(), "ga_sync");
    const csvFilePath = path.join(csvDirectory, csvFileName);

    await fs.mkdir(csvDirectory, { recursive: true });

    const header = [
      "country_id",
      "session_source_medium",
      "landing_page",
      "shop_id",
      "event_datetime",
      "event_count",
      "locale",
      "surface_type",
      "surface_detail",
    ];
    const csvHeader = header.join(",") + "\n";
    const csvRows = data
      .map((row) =>
        row
          .map((value) => {
            const strValue = String(value);
            if (
              strValue.includes(",") ||
              strValue.includes('"') ||
              strValue.includes("\n")
            ) {
              return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
          })
          .join(",")
      )
      .join("\n");

    await fs.writeFile(csvFilePath, csvHeader + csvRows);
    console.log(`Successfully created CSV backup at ${csvFilePath}`);
  } catch (csvError) {
    console.error("Failed to create CSV backup:", csvError);
  }
}

async function syncGaDataToMysql() {
  if (!propertyId) {
    console.error("GA_PROPERTY_ID is not defined in .env file.");
    return;
  }

  console.log("Starting GA data sync...");
  let pool: mysql.Pool | null = null;
  try {
    // 1. Connect to MySQL
    console.log("Connecting to MySQL database...");
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log("Successfully connected to MySQL.");

    // 2. Fetch and process data
    const gaResponse = await fetchGaReport(propertyId);
    const processedData = processGaData(gaResponse);

    if (processedData.length === 0) {
      console.log("No data to process.");
      return;
    }

    // 3. Save to DB and create backup
    await saveToDatabase(connection, processedData);
    await createCsvBackup(processedData);

    // 4. Release connection
    connection.release();
  } catch (error) {
    console.error("An error occurred during the sync process:", error);
  } finally {
    if (pool) {
      await pool.end();
      console.log("MySQL connection pool closed.");
    }
  }
}

// Run the sync
syncGaDataToMysql();
