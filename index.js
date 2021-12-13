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
    core.warning('Could not find pull request for this push...')
    return
  }

  const base_commit_sha = pull.base.sha

  const head_version = await get_version_at_commit(owner, repo, push_commmit_sha)
  const base_version = await get_version_at_commit(owner, repo, base_commit_sha)

  core.debug(`Head Version: ${head_version}`)
  core.debug(`Base Version: ${base_version}`)

  const head_is_higher = semver.gt(head_version, base_version)

  if (!head_is_higher) {
    core.setFailed(`The head version (${head_version}) is not greater than the base version (${base_version})`)
    return
  }

  core.debug(`Success, the head version (${head_version}) has been validated to be higher than the base version (${base_version}).`)

}

function parse_version(str) {
  core.debug(`RegExp: ${regex}`)
  core.debug(`Version Input: ${str}`)
  const matches = str.match(new RegExp(regex))
  return matches && matches.length > 1 ? matches[1] : null
}

async function get_version_at_commit(owner, repo, hash) {
  core.debug(`Pulling version from ${owner}/${repo}/${hash}/${file_path}`)
  try {
    const data = octokit.rest.repos.getContent({
      mediaType: {
        format: "raw",
      },
      owner: owner,
      repo: repo,
      path: file_path,
      ref: hash
    });
    core.debug(data)
    return parse_version(data)
  } catch(err) {
    core.error(err.toString())
    core.setFailed(err.toString())
    throw `Failed to get and parse version from ${owner}/${repo}/${hash}/${file_path}`
  }
}

run().catch(err => {
  console.error(err)
  console.trace()
  process.exit(1)
})
