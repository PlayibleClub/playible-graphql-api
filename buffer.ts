var convert = require("xml-js")
var S3 = require("aws-sdk/clients/s3")
var fs = require("fs")

const athlete_img = fs.readFileSync(`./src/utils/nfl-svg-teams-promo-templates/SEA.svg`, "utf-8")
// const athlete_script = fs.readFileSync(`./src/utils/nfl-svg-teams-animation-scripts/ATL_Animation.svg`, "utf-8")

var options = { compact: true, ignoreComment: true, spaces: 4 }
var result = convert.xml2js(athlete_img, options)

// ATHLETE ANIMATION START
// console.log(result.svg.g[5].text[0].tspan["_cdata"])
// console.log(result.svg.g[5].text[1].tspan["_cdata"])
// console.log(result.svg.g[5].text[4].tspan["_attributes"]["font-size"])
// console.log(result.svg.g[5].text[5].tspan)
// console.log(result.svg.g[5].text[2].tspan["_cdata"])
// console.log(result.svg.g[5].text[3].tspan["_cdata"])
// console.log(result.svg.g[5].g[0].text[0].tspan["_cdata"])
// console.log(result.svg.g[5].g[0].text[1].tspan["_cdata"])

// result.svg.g[5].text[0].tspan["_cdata"] = "69"
// result.svg.g[5].text[1].tspan["_cdata"] = "69"
// result.svg.g[5].text[2].tspan["_cdata"] = "SP"
// result.svg.g[5].text[3].tspan["_cdata"] = "SP"
// result.svg.g[5].text[4].tspan["_cdata"] = "VINCE"
// result.svg.g[5].text[5].tspan["_cdata"] = "VINCE"
// result.svg.g[5].text[6].tspan["_cdata"] = "GONZALES"
// result.svg.g[5].text[7].tspan["_cdata"] = "GONZALES"
// ATHLETE ANIMATION END

// ATHLETE IMAGE PROMO START
console.log(result.svg.g[5]["text"][0]["tspan"]["_text"])
console.log(result.svg.g[5]["text"][1]["tspan"]["_text"])
console.log(result.svg.g[5]["text"][2]["tspan"]["_text"])
console.log(result.svg.g[5].text[1]["_attributes"]["style"])

// result.svg.path[10]["_attributes"]["fill"] = "#ffffff"
// console.log(result.svg.path[10])

result = convert.js2xml(result, options)
// result = result.replace('</svg>', athlete_script)
// console.log(result)

// var buf = Buffer.from(result, "utf8")
// console.log(buf)
fs.writeFileSync("./testAthleteAnimation.svg", result)

// const s3 = new S3({
//   accessKeyId: "AKIAX6T25ZTY2K544WCG",
//   secretAccessKey: "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",
// })

// const filename = "test-athlete.svg"
// const s3_location = "media/test/"
// const fileContent = buf

// const params = {
//   Bucket: "playible-api-dev",
//   Key: `${s3_location}${filename}`,
//   Body: fileContent,
// }

// s3.upload(params, (err, data) => {
//   console.log(data)
//   console.log(err)
// })
