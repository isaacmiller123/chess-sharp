import { DatabaseSync } from 'node:sqlite'
const db=new DatabaseSync('resources/data/puzzles.sqlite',{readOnly:true})
const [lo,hi,...themes]=process.argv.slice(2)
const q=db.prepare(`SELECT COUNT(DISTINCT PuzzleId) c FROM puzzle_themes WHERE Rating BETWEEN ? AND ? AND Theme IN (${themes.map(()=>'?').join(',')})`)
console.log(themes.join('|'),`@${lo}-${hi}:`, q.get(+lo,+hi,...themes).c)
