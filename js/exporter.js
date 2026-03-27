/* ───────────────────────────────────────────
   § GradeExporter 클래스
─────────────────────────────────────────── */
class GradeExporter {
    static async toXlsx(students, target, fileName) {
        // 스키마 인덱스 중 가장 큰 값(가장 우측 컬럼) 계산
        const maxCol = Math.max(0, ...Object.values(target._idx).filter(i => i !== null && i !== undefined));

        const getVal = (s, key) => {
            // ───────────────────────────────────────────
            // 1. 일반적인 글로벌 공통 로직을 먼저 실행
            // ───────────────────────────────────────────
            const MAP = {
                grade_year: 'grade_year', class: 'class', number: 'number', name: 'name',
                kor_subject: s => s.korean.subject, kor_common_raw: s => s.korean.common_raw,
                kor_select_raw: s => s.korean.select_raw, kor_raw: s => s.korean.raw,
                kor_std: s => s.korean.std, kor_pct: s => s.korean.pct, kor_grade: s => s.korean.grade,
                math_subject: s => s.math.subject, math_common_raw: s => s.math.common_raw,
                math_select_raw: s => s.math.select_raw, math_raw: s => s.math.raw,
                math_std: s => s.math.std, math_pct: s => s.math.pct, math_grade: s => s.math.grade,
                eng_raw: s => s.english.raw, eng_std: s => s.english.std,
                eng_pct: s => s.english.pct, eng_grade: s => s.english.grade,
                inq1_subject: s => s.inquiry1.subject, inq1_raw: s => s.inquiry1.raw,
                inq1_std: s => s.inquiry1.std, inq1_pct: s => s.inquiry1.pct, inq1_grade: s => s.inquiry1.grade,
                inq2_subject: s => s.inquiry2.subject, inq2_raw: s => s.inquiry2.raw,
                inq2_std: s => s.inquiry2.std, inq2_pct: s => s.inquiry2.pct, inq2_grade: s => s.inquiry2.grade,
                hist_raw: s => s.hist.raw, hist_std: s => s.hist.std,
                hist_pct: s => s.hist.pct, hist_grade: s => s.hist.grade,
                fl2_subject: s => s.fl2.subject, fl2_raw: s => s.fl2.raw,
                fl2_std: s => s.fl2.std, fl2_pct: s => s.fl2.pct, fl2_grade: s => s.fl2.grade,
            };

            let baseValue = '';
            const fn = MAP[key];
            if (fn) {
                baseValue = typeof fn === 'function' ? fn(s) ?? '' : s[fn] ?? '';
            }

            // ───────────────────────────────────────────
            // 2. 특수 로직(customGetters) 실행 (선생님 아이디어 적용!)
            // ───────────────────────────────────────────
            // 특수 로직 함수에 두 번째 인자로 baseValue를 넘겨줍니다.
            // 필요하면 baseValue를 가공하고, 아니면 완전히 새로운 값을 계산합니다.
            if (target.customGetters && typeof target.customGetters[key] === 'function') {
                return target.customGetters[key](s, baseValue);
            }

            // 3. 특수 로직이 없으면 일반 로직의 결과를 그대로 반환
            return baseValue;
        };

        const headerRows = target.exportHeaders || [];

        // 데이터 행 생성
        const dataRows = students.map(s => {
            const row = new Array(maxCol + 1).fill('');
            for (const [k, i] of Object.entries(target._idx)) {
                if (i !== null && i !== undefined) {
                    row[i] = getVal(s, k);
                }
            }
            return row;
        });

        // 1. ExcelJS 워크북 및 시트 생성
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('성적데이터');

        // 2. 데이터(헤더 + 실제 데이터) 일괄 추가
        const sheetData = [...headerRows, ...dataRows];
        ws.addRows(sheetData);

        // 3. 컬럼 너비 자동 조정 로직
        const lastHeaderIndex = Math.max(0, headerRows.length - 1);
        const refRowForWidth = headerRows[lastHeaderIndex] || [];

        for (let ci = 0; ci <= maxCol; ci++) {
            const colWidth = Math.max(
                String(refRowForWidth[ci] || '').length,
                ...dataRows.map(r => String(r[ci] || '').length),
                4 // 최소 너비
            ) + 2;

            // ExcelJS는 컬럼 인덱스가 1부터 시작
            ws.getColumn(ci + 1).width = colWidth;
        }

        // 4. 버퍼 생성 및 브라우저 다운로드 처리
        const buffer = await wb.xlsx.writeBuffer();
        dlBlob(new Blob([buffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), fileName);
    }
}