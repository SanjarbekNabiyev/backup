import { exec } from "child_process";
import fs from "fs";
import mysql from "mysql2";
import archiver from "archiver";
import dotenv from "dotenv";
import cron from "node-cron";
import { uploadFunc } from "./firebase.js";
dotenv.config();

// create a connection to the MySQL server
const DB_USER = process.env.DB_USER;
const DB_HOST = process.env.DB_HOST;
const DB_PASS = process.env.DB_PASS;
console.log("Back up cron job is set!");

cron.schedule("00 23 * * *", () => {
  // (async () => {
    console.log("Operation started!");

    const connection = mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASS,
    });

    connection.connect((err) => {
      if (err) {
        console.error("error connecting: " + err.stack);
        return;
      }

      console.log("connected as id " + connection.threadId);

      // check if the backups directory exists
      if (fs.existsSync("backups")) {
        fs.rm("backups", { recursive: true }, (error) => {
          if (error) {
            console.error(`Failed to delete folder: ${error}`);
          } else {
            console.log("Old backups folder deleted");
            handleBackup(connection);
          }
        });
      } else {
        fs.mkdirSync("backups");
        handleBackup(connection);
      }
    });

    const handleBackup = (connection) => {
      if (fs.existsSync("backups.zip")) {
        fs.unlinkSync("backups.zip");
        console.log("Old backups.zip deleted");
      }
      if(!fs.existsSync("backups")) {
        fs.mkdirSync("backups");
      }
      connection.query("SHOW DATABASES", (error, results) => {
        if (error) {
          console.error("error fetching databases: " + error);
          return;
        }

        const expectedBackups = results.length;
        let successfulBackups = 0;

        results.forEach((result) => {
          const database = result.Database;
          const fileName = `backups/${database}.sql.gz`;
          const cmd = `mysqldump --skip-lock-tables --databases ${database} | gzip > ${fileName}`;

          exec(cmd, (err) => {
            if (err) {
              console.error(`error backing up ${database}: ` + err);
            } else {
              console.log(`successfully backed up ${database} to ${fileName}`);
              successfulBackups++;

              if (successfulBackups === expectedBackups) {
                const output = fs.createWriteStream("backups.zip");
                const archive = archiver("zip", { zlib: { level: 9 } });

                output.on("close", () => {
                  console.log("successfully created backups.zip");
                  uploadFunc("backups.zip");
                });

                archive.on("error", (err) => {
                  console.error("error creating backups.zip: " + err);
                });

                archive.pipe(output);
                archive.directory("backups", false);
                archive.finalize();
                connection.end();
              }
            }
          });
        });
      });
    };
  // })();
});
