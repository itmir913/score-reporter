import ExcelJS from 'exceljs';
import {colToIdx} from '../../src/js/utils.js';

/* 기준선(단계 0) 테스트용 가상 학생. 실제 학생 자료가 아니다.
 * 값은 논리 키(FIELD_LABELS 키)로 적고, 양식마다 그 양식의 fields 열 위치에 옮겨 적는다.
 * 양식에 없는 키는 그냥 빠진다 — 그 양식으로 읽으면 어떻게 되는지가 곧 기준선이다. */

const full = (o) => ({
    exam_year: 2026, student_id: 'S00', grade_year: 3, class: 1, number: 1, name: '가상',
    kor_subject: '화법과 작문', kor_common_raw: 60, kor_select_raw: 20, kor_raw: 80, kor_std: 120, kor_pct: 80, kor_grade: 3,
    math_subject: '미적분', math_common_raw: 50, math_select_raw: 20, math_raw: 70, math_std: 125, math_pct: 85, math_grade: 3,
    eng_raw: 85, eng_std: '', eng_pct: '', eng_grade: 2,
    inq_domain: '과학탐구',
    inq1_subject: '물리학Ⅰ', inq1_raw: 40, inq1_std: 60, inq1_pct: 80, inq1_grade: 3,
    inq2_subject: '화학Ⅰ', inq2_raw: 38, inq2_std: 58, inq2_pct: 75, inq2_grade: 4,
    hist_raw: 40, hist_std: '', hist_pct: '', hist_grade: 2,
    fl2_subject: '', fl2_raw: '', fl2_std: '', fl2_pct: '', fl2_grade: '',
    ...o,
});

const blankScores = {
    kor_common_raw: '', kor_select_raw: '', kor_raw: '', kor_std: '', kor_pct: '', kor_grade: '',
    math_common_raw: '', math_select_raw: '', math_raw: '', math_std: '', math_pct: '', math_grade: '',
    eng_raw: '', eng_grade: '', inq1_raw: '', inq1_std: '', inq1_pct: '', inq1_grade: '',
    inq2_raw: '', inq2_std: '', inq2_pct: '', inq2_grade: '', hist_raw: '', hist_grade: '',
};

const zeroScores = Object.fromEntries(Object.keys(blankScores).map(k => [k, 0]));

export const BASELINE_STUDENTS = [
    // 1·2반이 섞이고 번호가 뒤섞여 있어야 2·3차 정렬(반·번호)이 드러난다
    full({student_id: 'S01', class: 2, number: 3, name: '가상01'}),
    // 가상01과 원·표·백 합이 모두 같다 → 공동순위
    full({student_id: 'S02', class: 1, number: 5, name: '가상02'}),
    full({student_id: 'S03', class: 1, number: 2, name: '가상03', kor_raw: 95, kor_common_raw: 70, kor_select_raw: 25, kor_std: 140, kor_pct: 98, kor_grade: 1}),
    // 탐구 1과목만 응시
    full({student_id: 'S04', class: 1, number: 7, name: '가상04', inq2_subject: '', inq2_raw: '', inq2_std: '', inq2_pct: '', inq2_grade: ''}),
    // 탐구1은 비고 탐구2만 있음
    full({student_id: 'S05', class: 2, number: 1, name: '가상05', inq1_subject: '', inq1_raw: '', inq1_std: '', inq1_pct: '', inq1_grade: ''}),
    // 탐구 과목명이 같고 점수가 다름
    full({student_id: 'S06', class: 2, number: 2, name: '가상06', inq2_subject: '물리학Ⅰ', inq2_raw: 30}),
    // 원점수만 있음(가채점 꼴)
    full({student_id: 'S07', class: 1, number: 1, name: '가상07', kor_std: '', kor_pct: '', math_std: '', math_pct: '', inq1_std: '', inq1_pct: '', inq2_std: '', inq2_pct: ''}),
    // 원점수 열이 비고 공통·선택만 있음(sumParts)
    full({student_id: 'S08', class: 2, number: 4, name: '가상08', kor_raw: '', math_raw: '', math_select_raw: ''}),
    // 모든 점수 0 → 미응시
    full({student_id: 'S09', class: 1, number: 9, name: '가상09', ...zeroScores}),
    // 공통 0·선택 빈칸·나머지 전부 0 → sumParts 와 미응시 규칙이 겹친다
    full({student_id: 'S10', class: 1, number: 10, name: '가상10', ...zeroScores, kor_raw: '', kor_select_raw: '', math_raw: '', math_select_raw: ''}),
    // 0점 하나는 0점이다
    full({student_id: 'S11', class: 2, number: 5, name: '가상11', inq2_raw: 0}),
    // 결시(전부 빈칸)
    full({student_id: 'S12', class: 2, number: 6, name: '가상12', ...blankScores}),
    // 숫자로 읽지 않는 값과 '점'·'%' 꼬리
    full({student_id: 'S13', class: 2, number: 7, name: '가상13', kor_raw: '81점', kor_pct: '82%', math_raw: '1,234', inq1_raw: '85abc', eng_grade: '1등급'}),
    // 이름이 비면 학생이 아니다
    full({student_id: 'S14', class: 2, number: 8, name: ''}),
];

/** 양식 정의의 exportHeaders 를 머리글로, BASELINE_STUDENTS 를 본문으로 하는 워크북 */
export function buildWorkbook(schema, students = BASELINE_STUDENTS) {
    const width = Math.max(...schema.exportHeaders.map(r => r.length),
        ...Object.values(schema.fields).filter(Boolean).map(c => colToIdx(c) + 1));
    const rows = students.map(st => {
        const row = new Array(width).fill('');
        for (const [key, col] of Object.entries(schema.fields)) {
            if (!col || !(key in st)) continue;
            row[colToIdx(col)] = st[key];
        }
        return row;
    });
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('성적').addRows([...schema.exportHeaders, ...rows]);
    return wb;
}
