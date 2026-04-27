#!/bin/bash

# Stop the app
docker compose down

# Copy backup into the volume
docker run --rm -v guitar-practice-tracker_guitar-data:/data -v $(pwd):/backup alpine cp /backup/guitar_backup.db /data/guitar.db

# Start the app again
docker compose up -d
