import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const dbConfig: mysql.PoolOptions = {
  host: process.env.TEST_DB_HOST,
  user: process.env.TEST_DB_USER,
  password: process.env.TEST_DB_PASSWORD,
  database: process.env.TEST_DB_DATABASE,
  port: 3307,
  // set timezone as mysql server timezone: show variables like 'system_time_zone';
  // default is local. Or run SET time_zone = '${localTimezone}'; after getting connection
  timezone: "+00:00",
};

async function runSql() {
  let pool: mysql.Pool | null = null;
  try {
    // 1. Connect to MySQL
    console.log("Connecting to MySQL database...");
    pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();
    console.log("Successfully connected to MySQL.");
    console.log("Current time:", new Date().toString());
    const result = await connection.query("select now()");
    console.log("Current time:", result[0]);
    console.log(
      "timezone:",
      await connection.query("select @@session.time_zone")
    );
    console.log(
      "system timezone:",
      await connection.query("show variables like 'system_time_zone'")
    );

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

runSql();
