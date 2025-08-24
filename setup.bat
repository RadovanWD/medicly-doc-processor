@echo off

REM Create the main project directories
echo Creating directories...
md doc
md src\services

REM Create the project files
echo Creating files...
type nul > .env
type nul > setup.sql
type nul > package.json
type nul > process-docs.js
type nul > src\services\database.js
type nul > src\services\docProcessor.js
type nul > src\services\logger.js

echo ✅ Project structure created successfully!