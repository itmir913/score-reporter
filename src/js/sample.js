/* ───────────────────────────────────────────
   § 샘플 데이터 (가상 학생으로 만든 3월·6월·9월 회차)
   같은 가상 학생들이 세 회차를 모두 본다. 학생마다 실력과 오르내리는 기울기가 있어
   통계 탭에서 회차별 흐름이 보인다. 누를 때마다 새 씨앗으로 만들어 매번 다른 샘플이 나온다.
   씨앗을 넘기면(시험용) 같은 샘플이 다시 나온다. 모든 값은 끝에서 범위 안으로 자르고 반올림한다.
─────────────────────────────────────────── */

export const SAMPLE_KEYS = ['3월 샘플', '6월 샘플', '9월 샘플'];
export const SAMPLE_SIZE = 100;

// 무작위 이름 생성을 위한 성/이름 배열
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'];
const firstNames = ['서준', '하준', '도윤', '시우', '민준', '지호', '예준', '주원', '건우', '우진', '지안', '수아', '서윤', '서연', '하윤', '지우', '하은', '민서', '윤서', '채원', '도현', '준서', '민재', '현우', '승우', '지민', '수현', '지원', '다은', '은지'];

const subjectsKor = ['화법과 작문', '언어와 매체'];
const subjectsMath = ['확률과 통계', '미적분', '기하'];
const subjectsInq = ['생활과 윤리', '윤리와 사상', '한국지리', '세계지리', '동아시아사', '세계사', '경제', '정치와 법', '사회·문화', '물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ'];

// 새 씨앗. crypto 가 없는 환경에서는 Math.random 으로 만든다
function randomSeed() {
    if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 2 ** 32);
}

// 씨앗을 받는 난수 (mulberry32)
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 원점수 기반 등급 계산
const getGrade = (raw, max) => {
    const r = raw / max;
    if (r >= 0.9) return 1;
    if (r >= 0.8) return 2;
    if (r >= 0.7) return 3;
    if (r >= 0.6) return 4;
    if (r >= 0.5) return 5;
    if (r >= 0.4) return 6;
    if (r >= 0.3) return 7;
    if (r >= 0.2) return 8;
    return 9;
};

// 한국사 절대평가: 40점 이상 1등급, 5점마다 한 등급씩 내려간다
const histGrade = (raw) => Math.min(9, Math.max(1, 9 - Math.floor(raw / 5)));

// 원점수 하나에서 공통·선택 원점수, 표준점수·백분위·등급을 함께 만든다.
// 모두 원점수에 따라 커지므로 한 회차 한 과목 안에서 서로 어긋나지 않는다
const split = (raw, selectMax) => {
    const select = Math.round(raw * selectMax / 100);
    return {common_raw: raw - select, select_raw: select};
};
const korean = (subject, raw) => ({subject, ...split(raw, 24), raw, std: Math.floor(raw * 0.8 + 50), pct: Math.floor(raw), grade: getGrade(raw, 100)});
const math = (subject, raw) => ({subject, ...split(raw, 26), raw, std: Math.floor(raw * 0.9 + 50), pct: Math.floor(raw), grade: getGrade(raw, 100)});
const inquiry = (subject, raw) => ({subject, raw, std: Math.floor(raw * 1.2 + 20), pct: Math.floor((raw / 50) * 100), grade: getGrade(raw, 50)});
// 응시하지 않은 탐구는 과목명도 점수도 비운다 (0점이 아니다)
const noInquiry = () => ({subject: '', raw: null, std: null, pct: null, grade: null});

/**
 * 세 회차의 샘플을 만든다. 씨앗을 주지 않으면 매번 다르고, 같은 씨앗이면 같은 결과다.
 * @returns {{key: string, students: object[]}[]} 3월·6월·9월 순서
 */
export function generateSampleExams(seed = randomSeed()) {
    const rand = mulberry32(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    // 정규분포 난수 (Box-Muller)
    const randn = () => {
        let u = 0, v = 0;
        while (u === 0) u = rand();
        while (v === 0) v = rand();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
    const clamp = (v, max) => Math.min(max, Math.max(0, Math.round(v)));

    // 학생 무리: 실력(ability), 회차마다 오르내리는 기울기(slope), 과목별 강약, 선택과목
    const cohort = [];
    for (let i = 0; i < SAMPLE_SIZE; i++) {
        const inq1 = pick(subjectsInq);
        cohort.push({
            name: pick(lastNames) + pick(firstNames),
            class: String(Math.floor(rand() * 5) + 1), // 1반 ~ 5반
            ability: randn(),
            slope: randn() * 0.3,
            bias: {kor: randn() * 0.5, math: randn() * 0.5, eng: randn() * 0.5, inq1: randn() * 0.5, inq2: randn() * 0.5, hist: randn() * 0.5},
            korSub: pick(subjectsKor),
            mathSub: pick(subjectsMath),
            inq1,
            // 탐구 두 과목은 서로 다른 과목이다
            inq2: pick(subjectsInq.filter(sub => sub !== inq1)),
        });
    }

    // 반, 이름 순으로 정렬 후 번호를 1번부터 매긴다. 번호는 세 회차 내내 같다
    cohort.sort((a, b) => a.class.localeCompare(b.class, undefined, {numeric: true}) || a.name.localeCompare(b.name));
    let currentClass = '';
    let numCounter = 1;
    cohort.forEach(s => {
        if (s.class !== currentClass) {
            currentClass = s.class;
            numCounter = 1;
        }
        s.number = String(numCounter++);
    });

    // 특이한 경우 몇 가지 (자리는 고정)
    const absentIn6 = new Set([7, 58]);        // 6월에 결시해 명단에 없다
    const oneInquiryIn9 = new Set([21, 73]);   // 9월에 탐구를 한 과목만 봤다
    const changer = 40;                        // 9월에 탐구2 과목을 바꿨다
    const twins = [[12, 13], [66, 88]];        // 합산 점수가 같다 (뒤 학생이 앞 학생 점수를 그대로 받는다)
    const changedSub = subjectsInq.find(sub => sub !== cohort[changer].inq1 && sub !== cohort[changer].inq2);

    const year = String(new Date().getFullYear());
    return SAMPLE_KEYS.map((key, t) => {
        const drift = (s) => s.ability * 0.85 + (s.slope + 0.08) * t; // 전체도 조금씩 오른다
        const raws = cohort.map(s => {
            const z = (b) => drift(s) + b + randn() * 0.35;
            return {
                kor: clamp(65 + z(s.bias.kor) * 15, 100),
                math: clamp(55 + z(s.bias.math) * 20, 100),
                eng: clamp(60 + z(s.bias.eng) * 18, 100),
                inq1: clamp(30 + z(s.bias.inq1) * 10, 50),
                inq2: clamp(30 + z(s.bias.inq2) * 10, 50),
                hist: clamp(35 + z(s.bias.hist) * 8, 50),
            };
        });
        twins.forEach(([a, b]) => { raws[b] = {...raws[a]}; });

        const students = [];
        cohort.forEach((s, i) => {
            if (t === 1 && absentIn6.has(i)) return;
            const r = raws[i];
            const inq2Sub = t === 2 && i === changer ? changedSub : s.inq2;
            students.push({
                exam_year: year,
                grade_year: '3',
                class: s.class,
                number: s.number,
                name: s.name,
                korean: korean(s.korSub, r.kor),
                math: math(s.mathSub, r.math),
                english: {raw: r.eng, std: null, pct: null, grade: getGrade(r.eng, 100)},
                inquiry1: inquiry(s.inq1, r.inq1),
                inquiry2: t === 2 && oneInquiryIn9.has(i) ? noInquiry() : inquiry(inq2Sub, r.inq2),
                hist: {raw: r.hist, std: null, pct: null, grade: histGrade(r.hist)},
                fl2: {subject: '', raw: null, std: null, pct: null, grade: null},
            });
        });
        return {key, students};
    });
}
