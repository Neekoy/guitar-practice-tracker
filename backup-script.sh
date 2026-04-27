#!/bin/bash

docker run --rm -v guitar-practice-tracker_guitar-data:/data -v /Users/hris/Projects/guitar-practice-tracker/backup:/backup alpine cp /data/guitar.db /backup/guitar_backup.db
git add /Users/hris/Projects/guitar-practice-tracker/backup/guitar_backup.db
git commit -m "chore(guitar-progress-tracker): Database Backup"
git push
