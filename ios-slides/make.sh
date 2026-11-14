#!/bin/bash
# Builds Sleek Slides for iPhone: ./make.sh, ./make.sh check, or ./make.sh phone <team>. See ../ios-shared/build.sh.
cd "$(dirname "$0")" && exec ../ios-shared/build.sh SleekSlides com.sleek.slides "$@"
