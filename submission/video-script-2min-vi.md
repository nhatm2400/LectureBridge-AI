# Kịch bản video Intel — 2 phút (Tiếng Việt)

## 0:00–0:15 — Vấn đề

**Hình ảnh:** Bắt đầu ngay trong bài giảng demo. Video đang ở một đoạn muộn, bên cạnh là transcript dài.

**Lời nói:** “Phụ đề cho thấy từng câu, nhưng chưa chắc khôi phục mạch học. Bỏ lỡ vài phút, người học phải đọc transcript dài để biết chủ đề đã đổi gì và câu hỏi nào vừa được trả lời.”

## 0:15–0:40 — Khôi phục đúng phần vừa bỏ lỡ

**Hình ảnh:** Trong mục “Tôi đã bỏ lỡ gì?”, chọn cửa sổ thời gian phù hợp rồi bấm “Phục hồi ngữ cảnh”. Hiển thị kết quả đã chuẩn bị của chính bài giảng này.

**Lời nói:** “Đây là LectureBridge. Trong mục ‘Tôi đã bỏ lỡ gì?’, tôi chọn cửa sổ cần khôi phục rồi bấm ‘Phục hồi ngữ cảnh’. Hệ thống không tóm tắt cả bài; nó dựng lại phần vừa bỏ lỡ từ transcript và các sự kiện ngữ nghĩa của chính bài giảng.”

## 0:40–1:05 — Lộ trình học đã diễn ra

**Hình ảnh:** Lần lượt chỉ vào `TOPIC_CHANGE`, câu hỏi, câu trả lời liên kết và một `EXAMPLE` hoặc `IMPORTANT`; mở nhanh quan hệ Q↔A trên Semantic Timeline.

**Lời nói:** “Kết quả cho tôi thấy lộ trình đã diễn ra: một lần chuyển chủ đề, câu hỏi giảng viên đặt ra, câu trả lời xuất hiện sau đó, cùng ví dụ hoặc ý quan trọng. Liên kết Q với A giữ quan hệ giữa các ý, thay vì biến transcript thành một danh sách câu rời rạc.”

## 1:05–1:20 — Kiểm chứng tại nguồn

**Hình ảnh:** Kích hoạt một citation trong kết quả Context Recovery và cho thấy player seek về đúng đoạn nguồn.

**Lời nói:** “Mỗi mục đều có bằng chứng. Mở nguồn sẽ đưa video về đúng thời điểm. Model chọn source ID; backend kiểm tra ID và lấy timestamp từ transcript canonical, nên model không thể tạo mốc thời gian.”

## 1:20–1:35 — Hỏi tiếp mà không rời bài giảng

**Hình ảnh:** Hiển thị một câu hỏi follow-up đã chuẩn bị, câu trả lời có căn cứ và citation tương ứng.

**Lời nói:** “Sau khi nối lại mạch học, tôi có thể hỏi tiếp về chính đoạn này. LectureBridge chỉ trả lời từ evidence của bài hiện tại, hiển thị citation và cho phép kiểm chứng ngay trên video.”

## 1:35–1:45 — Biết khi nào không nên trả lời

**Hình ảnh:** Hiển thị câu hỏi ngoài nội dung đã chuẩn bị và trạng thái abstention không có citation.

**Lời nói:** “Nếu tôi hỏi điều bài giảng không chứa, hệ thống từ chối thay vì dùng kiến thức ngoài hoặc đoán.”

## 1:45–2:00 — Bằng chứng ban đầu và giới hạn

**Hình ảnh:** Bảng có nhãn rõ “Small synthetic human-verified evaluation”, ba metric chính và dòng “one reviewer; no universal accessibility claim”.

**Lời nói:** “Đánh giá synthetic do một người xác minh: Event precision 20 trên 20, recall VI/EN 11 trên 12, Context grounding 51 trên 51. Đây là bằng chứng ban đầu, không phải kết luận hiệu quả phổ quát.”

## Quy tắc quay

- Recovery journey chiếm 80/120 giây đầu, tương đương 66,7% video.
- Dùng kết quả UI đã chuẩn bị; không reprocess và không gọi real provider chỉ để quay lại cảnh.
- Không quay admin, upload, settings hoặc danh sách toàn bộ tính năng.
- Đây là kịch bản submission-specific cho Intel Vietnam AI Impact Festival 2026; không mô tả roadmap như chức năng hiện có.
