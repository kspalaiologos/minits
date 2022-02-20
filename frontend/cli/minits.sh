#!/bin/bash

dir=$(cd -P -- "$(dirname -- "$0")" && pwd -P)

trap cleanup INT

function cleanup {
    curl -F "token=$apikey" "$server/api/stop/$taskId"
    exit 0
}

function minits_autoball {
    ( cd $1 && zip -9 -r $dir/minits_slug.zip * )
}

function minits_merge {
    if [ "$( cat $1 | jq 'has("zipball")' )" == "true" ]; then
        $( cat $1 | jq -r '.zipball' ) | source /dev/stdin
    else
        check_dir "minits"
        check_dir "test"
        check_dir "tests"
    fi
    
    apikey=$( cat $1 | jq -r '.key' )
    server=$( cat $1 | jq -r '.server' )

    if [ ! -f minits_slug.zip ]; then
        echo "couldn't create the zipball"
        exit 1
    fi

    initial_req=$(curl -F "zipball=@minits_slug.zip" -F "token=$apikey" "$server/api/start")
    taskId=$(echo $initial_req | jq -r '.id' )

    rm -f minits_slug.zip

    response=""

    running=1
    while : ; do
        local new_response=$(curl "$server/api/shortquery/$taskId" 2> /dev/null)
        local running=$(echo "$new_response" | jq -r '.status | .alive')
        [[ "false" == "$running" ]] && break
        response="$new_response"
        echo "$response"
        sleep 1s
    done
    running=0

    # Now query the correct endpoint
    curl "$server/api/query/$taskId"
}

function check_dir {
    [ -d $1 ] && minits_autoball $1
}

function check_project {
    [ -f $1.json ] && minits_merge $1.json
}

# -- common configuration file locations
check_project minits
check_project minits/cli
