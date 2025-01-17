const github = require('@actions/github');
const core = require('@actions/core')
const semver = require('semver')

const token = core.getInput('github-token' );
const regex = core.getInput('version-regex-pattern') || `VERSION = [\\'\\"](.+?)[\\'\\"]`;
const file_path = core.getInput('version-file-path') || 'version.py';
const octokit = github.getOctokit(token)

async function run() {
  const event = github.context.payload

  const repo = event.repository.name
  const owner = event.repository.owner.login
  let pull_request
  if (github.context.eventName === "push"){
    // get pr if exists
    let { data: pulls } = await octokit.rest.pulls.list({ owner, repo })
    pull_request = pulls.find(p => p.head.sha == event.after)
  } else if (github.context.eventName === "pull_request"){
    // Type: https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#pull_request
    pull_request = event.pull_request
  } else {
    core.warning(`Unsupported event: ${github.context.eventName}`)
    return
  }

  if(!pull_request){
    core.warning('Could not find pull request for this push...')
    return
  }

  // parallel fetch both version lookups
  let [head_version, base_version] = await Promise.all([
    get_version_at_commit(owner, repo, pull_request.head.sha),
    get_version_at_commit(owner, repo, pull_request.base.sha)
  ])

  core.debug(`Head Version: ${head_version.value}`)
  core.debug(`Base Version: ${base_version.value}`)

  if (!semver.gt(head_version.value, base_version.value)) {
    octokit.rest.checks.create({
      owner: owner,
      repo: repo,
      name: "semver-bump",
      head_sha: pull_request.head.sha,
      conclusion: "failure",
      output: {
        title: "Check for semver version bump",
        summary: `Version not bumped in ${file_path}`,
        annotations: [{
          annotation_level: "failure",
          message: `The head version (${head_version.value}) is not greater than the base version (${base_version.value})`,
          path: file_path,
          start_line: head_version.lineNumber,
          end_line: head_version.lineNumber,
          start_column: head_version.column,
          end_column: head_version.column
        }]
      }
    })
  } else {
    octokit.rest.checks.create({
      owner: owner,
      repo: repo,
      name: "semver-bump",
      head_sha: pull_request.head.sha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "Check for semver version bump",
        summary: `Version bumped in ${file_path}`,
        annotations: [{
          annotation_level: "notice",
          message: `Success, the head version (${head_version.value}) has been validated to be higher than the base version (${base_version.value}).`,
          path: file_path,
          start_line: head_version.lineNumber,
          end_line: head_version.lineNumber,
          start_column: head_version.column,
          end_column: head_version.column
        }]
      }
    })
  }
}

async function get_version_at_commit(owner, repo, hash) {
  core.debug(`Pulling version from ${owner}/${repo}/${hash}/${file_path}`)
  const version = octokit.rest.repos.getContent({
    mediaType: {
      format: "raw",
    },
    owner: owner,
    repo: repo,
    path: file_path,
    ref: hash
  })
  .then(({data}) => parse_version(data))
  .catch(err => {
    core.error(err.toString())
    core.setFailed(err.toString())
    throw `Failed to get and parse version from ${owner}/${repo}/${hash}/${file_path}`
  })
  return version
}

function parse_version(str) {
  core.debug(`RegExp: ${regex}`)
  core.debug(`Version Input: ${str}`)

  re = new RegExp(regex,'gm')
  // only find first match, must include capture
  // group[1] with actual version string
  match = re.exec(str);
  pos = lineNumberByIndex(re.lastIndex, str)
  
  return match && match.length > 1 ? {
    value: match[1],
    lineNumber: pos[0],
    column: re.lastIndex - pos[1] - match[1].length
  } : {
    value: null,
    lineNumber: 0,
    column: 0
  }
}

function lineNumberByIndex(index, string) {
  const re = /^[\S\s]/gm
  let line = 1, match
  let lastRowIndex = 0
  while ((match = re.exec(string))) {
    if (match.index > index) break
    lastRowIndex = match.index
    line++;
  }
  return [Math.max(line - 1, 1), lastRowIndex]
}

run().catch(err => {
  console.error(err)
  console.trace()
  process.exit(1)
})
