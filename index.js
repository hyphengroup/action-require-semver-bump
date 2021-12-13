const github = require('@actions/github');
const core = require('@actions/core')
const semver = require('semver')

const token = core.getInput('github-token' );
const regex = core.getInput('version-regex-pattern') || `VERSION = [\\'\\"](.+?)[\\'\\"]`;
const file_path = core.getInput('version-file-path') || 'version.py';
const octokit = github.getOctokit(token)

async function run() {
  // Type: https://developer.github.com/v3/activity/events/types/#pushevent
  const event = github.context.payload

  const repo = event.repository.name
  const owner = event.repository.owner.login
  const push_commmit_sha = event.after

  core.debug(`owner/repo: ${owner}/${repo}`)
  const { data: pulls } = await octokit.rest.pulls.list({ owner, repo })

  const pull = pulls.find(p => p.head.sha == push_commmit_sha)

  if (!pull) {
    // There will obviously be many pushes that are not to branches with
    // active PRs. So, this could mean nothing. It could however mean that
    // something is wrong because there really is a PR for this push but
    // we couldn't find it.
    core.warning('Could not find pull request for this push...', {
      title: "Bump semver version",
      file: file_path
    })
    return
  }

  const base_commit_sha = pull.base.sha

  // parallel fetch both version lookups
  let [head_version, base_version] = await Promise.all([
    get_version_at_commit(owner, repo, push_commmit_sha),
    get_version_at_commit(owner, repo, base_commit_sha)
  ])

  core.debug(`Head Version: ${head_version.value}`)
  core.debug(`Base Version: ${base_version.value}`)

  if (!semver.gt(head_version.value, base_version.value)) {
    core.error(`The head version (${head_version.value}) is not greater than the base version (${base_version.value})`,{
      title: "Bump semver version",
      file: file_path,
      startLine: head_version.lineNumber,
      startColumn: head_version.column
    })
    core.setFailed(`The head version (${head_version}) is not greater than the base version (${base_version})`)
    return
  }
  core.debug(`Success, the head version (${head_version.value}) has been validated to be higher than the base version (${base_version.value}).`)
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
  let line = 0, match
  let lastRowIndex = 0
  while ((match = re.exec(string))) {
    if (match.index > index) break
    lastRowIndex = match.index
    line++;
  }
  return [Math.max(line - 1, 0), lastRowIndex]
}

run().catch(err => {
  console.error(err)
  console.trace()
  process.exit(1)
})
