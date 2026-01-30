#!/bin/bash
cd /home/kavia/workspace/code-generation/interactive-trivia-challenge-207920-207930/trivia_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

