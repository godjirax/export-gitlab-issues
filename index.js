const fetch = require("node-fetch")
const fs = require("fs")
const FormData = require("form-data")
const tmpDir = require("os").tmpdir()
const path = require("path")
const { execSync } = require("child_process")
const cliProgress = require("cli-progress")
const { spawn } = require("child_process")

const {
  FROM_TOKEN,
  FROM_DOMAIN,
  FROM_PROJECT_NAME,
  FROM_PROJECT_ID,

  TO_TOKEN,
  TO_DOMAIN,
  TO_PROJECT_ID
} = process.env

const get = async (url, token) => {
  const result = await fetch(url, {
    headers: {
      "PRIVATE-TOKEN": token
    }
  })
  return result.json()
}

const retrieveIssues = async () =>
  get(
    `${FROM_DOMAIN}/api/v4/projects/${FROM_PROJECT_ID}/issues?per_page=100`,
    FROM_TOKEN
  )

const download = (url, filePath) => {
  return new Promise(resolve => {
    var child = spawn("curl", [url, "-o", filePath])

    child.on("close", function(code) {
      resolve()
    })
  })
}

const saveImage = async url => {
  const filename = url.substring(url.lastIndexOf("/") + 1)

  await download(url, path.join(tmpDir, filename))
  return filename
}

/**
 * Uploads files to project destination.
 * @param {*} uploads
 * @returns {*} Object like: { <upload_src>: <upload_dest>s}
 */
const uploadFiles = async uploads => {
  const uploadsSent = {}

  for (let upload of uploads) {
    const fileUrl = `${FROM_DOMAIN}/${FROM_PROJECT_NAME}${upload}`

    const fileName = await saveImage(fileUrl)
    const filePathToSend = path.join(tmpDir, fileName)

    const stream = fs.createReadStream(filePathToSend)
    const form = new FormData()
    form.append("file", stream)

    const res = await fetch(
      `${TO_DOMAIN}/api/v4/projects/${TO_PROJECT_ID}/uploads`,
      {
        method: "POST",
        body: form,
        headers: {
          "PRIVATE-TOKEN": TO_TOKEN
        }
      }
    )

    const result = await res.json()
    uploadsSent[upload] = result.url

    // Remove file
    fs.unlink(filePathToSend, err => {
      if (err) {
        console.error(err)
      }
    })
  }

  return uploadsSent
}

/**
 * Post issue to project destination.
 * @param {*} param0
 */
const postIssue = ({ title, description }) =>
  fetch(`${TO_DOMAIN}/api/v4/projects/${TO_PROJECT_ID}/issues`, {
    headers: {
      "PRIVATE-TOKEN": TO_TOKEN,
      "Content-Type": "application/json"
    },
    method: "POST",
    body: JSON.stringify({
      title,
      description
    })
  })

const retrieveNotes = issueIid =>
  get(
    `${FROM_DOMAIN}/api/v4/projects/${FROM_PROJECT_ID}/issues/${issueIid}/notes?per_page=100`,
    FROM_TOKEN
  )

/**
 * Post note to project destination issue.
 * @param {*} param0
 */
const postIssueNote = (issue_iid, body) =>
  fetch(
    `${TO_DOMAIN}/api/v4/projects/${TO_PROJECT_ID}/issues/${issue_iid}/notes`,
    {
      headers: {
        "PRIVATE-TOKEN": TO_TOKEN,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify({
        body
      })
    }
  )

const migrateNote = async (issue_iid, note) => {
  const newNote = note
  const foundUploads = findUploads(note.body)

  if (foundUploads) {
    const uploadsSent = await uploadFiles(foundUploads)
    newNote.body = changeUploadsLinks(newNote.body, uploadsSent)
  }

  return postIssueNote(issue_iid, note.body)
}

const migrateNotes = async (oldIssue, newIssue) => {
  try {
    const notes = await retrieveNotes(oldIssue.iid)

    for (const note of notes) {
      const res = await migrateNote(newIssue.iid, note)
    }
  } catch (err) {
    console.error(err)
  }
}

const migrateIssue = async oldIssue => {
  const newIssue = oldIssue
  const foundUploads = findUploads(oldIssue.description)

  if (foundUploads) {
    const uploadsSent = await uploadFiles(foundUploads)
    newIssue.description = changeUploadsLinks(newIssue.description, uploadsSent)
  }

  const postedIssue = await postIssue(newIssue)
  const newSavedIssue = await postedIssue.json()

  await migrateNotes(oldIssue, newSavedIssue)
  return newIssue
}

const start = async () => {
  const issues = await retrieveIssues()

  const bar1 = new cliProgress.SingleBar(
    {
      format:
        "CLI Progress | {bar} | {percentage}% || {value}/{total} Issues || Speed: {speed}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: false
    },
    cliProgress.Presets.shades_classic
  )

  bar1.start(issues.length, 0)

  let i = 0
  for (const issue of issues) {
    await migrateIssue(issue)
    i++
    bar1.update(i)
  }

  bar1.stop()
}

const changeUploadsLinks = (description, uploads) =>
  Object.keys(uploads).reduce(
    (newDescription, newUpload) =>
      newDescription.replace(newUpload, uploads[newUpload]),
    description
  )

const findUploads = description => {
  const uploads = /\(\/uploads\/.*\)/g.exec(description)

  if (uploads) {
    return Array.from(uploads).map(u => u.replace(/\(|\)/g, ""))
  }

  return null
}

start()
