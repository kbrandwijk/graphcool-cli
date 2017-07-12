// import csv from 'csv-stream'
// import * as through2 from 'through2'
//
// function toJSON() {
//   var options = {
//       delimiter : '\t', // default is ,
//       endLine : '\n', // default is \n,
//   }
//
//   return csv.createstream(options)
// }
//
// function toTypeValueArray() {
//   const _self = this;
//   return through2.obj((data, enc, cb) => {
//     const result = { record: data, typeName: "Movie" }
//     cb(null, result)
//   })
// }
//
// export const transforms = [toJSON, toTypeValueArray]
