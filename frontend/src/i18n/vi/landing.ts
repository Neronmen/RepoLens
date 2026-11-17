// Bản tiếng Việt của trang landing. Phải có đủ mọi khóa của ../en/landing.ts.
const landing = {
  'landing.nav.label': 'Điều hướng chính',
  'landing.nav.how': 'Quy trình',
  'landing.nav.trace': 'Trace',
  'landing.nav.github': 'GitHub',

  'landing.hero.eyebrow': 'Hỏi đáp code bằng agent',
  'landing.hero.line1': 'Hỏi repo.',
  'landing.hero.line2': 'Có dẫn chứng.',
  'landing.hero.lead':
    'Dán link một repo GitHub công khai. Agent sẽ tìm, đọc và trích đúng dòng code đứng sau mỗi câu trả lời, còn bạn xem được từng bước nó làm.',

  'landing.form.label': 'Link repo GitHub',
  'landing.form.submit': 'Lập chỉ mục →',
  'landing.form.try': 'thử',
  'landing.form.error':
    'Link này không giống repo GitHub. Hãy thử owner/repo hoặc https://github.com/owner/repo.',

  'landing.how.kicker': 'Cách hoạt động',
  'landing.how.title': 'Ba bước. Không đoán mò.',
  'landing.how.step1.title': 'Lập chỉ mục',
  'landing.how.step1.text':
    'Repo được tải về, lọc lấy các file mã nguồn thật, cắt thành các đoạn gối nhau rồi lưu để tìm kiếm toàn văn.',
  'landing.how.step2.title': 'Điều tra',
  'landing.how.step2.text':
    'Agent gọi các công cụ tìm kiếm, grep và đọc file qua nhiều bước. Chỉ đọc, chỉ trong một repo, tối đa sáu bước.',
  'landing.how.step3.title': 'Dẫn chứng',
  'landing.how.step3.text':
    'Mỗi ý đều trỏ tới file và khoảng dòng. Từng trích dẫn được đối chiếu với chỉ mục, cái nào bịa ra sẽ bị đánh dấu.',

  'landing.trace.kicker': 'Trace',
  'landing.trace.title': 'Xem nó nghĩ, từng bước một.',
  'landing.trace.lead':
    'Từng lần gọi công cụ, đối số, thời gian chạy và lượng văn bản trả về. Không có gì bị giấu sau một vòng quay chờ.',
  'landing.trace.chars': '→ {size} ký tự · {time}',
  'landing.trace.answerArg': 'trả lời',
  'landing.trace.answerMeta': '→ 6 trích dẫn · đều hợp lệ',
  'landing.trace.total': '10,351 vào · 575 ra · 4 lần gọi công cụ · 6.5s',
  'landing.trace.barTitle': 'trace · {repo}',

  'landing.footer.brand': 'repolens · xây dựng công khai',
  'landing.footer.source': 'Xem mã nguồn trên GitHub ↗',

  'landing.scene.label': 'Các file code vẽ thành đồ thị, đường đi của agent được làm nổi bật',
  'landing.scene.badgeLive': 'trực tiếp: agent đang đi qua repo',
  'landing.scene.badgeStatic': 'đường đi của agent: tìm, đọc, dẫn chứng',
} as const

export default landing
