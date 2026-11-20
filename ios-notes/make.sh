#!/bin/bash
# Builds Sleeky Notes for iPhone: ./make.sh, ./make.sh check, or ./make.sh phone <team>. See ../ios-shared/build.sh.
cd "$(dirname "$0")" && exec ../ios-shared/build.sh SleekNotes com.sleek.notes "$@"
