# Kịch bản video Intel — 2 phút

> Chỉ quay sau khi real-provider smoke, human evaluation và hero cache hợp lệ. Không đọc metric placeholder như một kết quả thật.

## 0–15 giây — Vấn đề

“Phụ đề giúp đọc được lời giảng, nhưng khi bỏ lỡ vài phút, sinh viên vẫn phải tìm trong một transcript rất dài. Với sinh viên Điếc và khiếm thính, câu hỏi quan trọng không chỉ là giảng viên đã nói gì, mà là phần nào đang diễn ra và bằng chứng nằm ở đâu.”

## 15–30 giây — LectureBridge AI

“LectureBridge AI giữ video, phụ đề song ngữ và transcript theo timestamp trong một luồng học được bảo vệ. Đây là bài demo tổng hợp do dự án tự tạo, không có dữ liệu cá nhân hay media của bên thứ ba.”

## 30–55 giây — Semantic Timeline

“AI trích xuất cấu trúc có evidence: chuyển chủ đề, câu hỏi, câu trả lời, ví dụ và điểm quan trọng. Câu hỏi được nối tới câu trả lời; mỗi mục có thể bấm để quay đúng đoạn. Giáo viên có thể xác nhận, sửa hoặc từ chối.”

## 55–80 giây — Context Recovery

“Nếu vừa mất tập trung, người học chọn ‘Tôi đã bỏ lỡ gì?’. Backend chỉ gửi cửa sổ gần đây cùng event và Q-A liên quan. Claim không map được về source sẽ bị loại, và timestamp không do model tự tạo.”

## 80–105 giây — Grounded Ask

“Người học hỏi về dirty read. LectureBridge chỉ tìm trong bài hiện tại, trả lời cùng citation rồi seek về bằng chứng. Với câu hỏi ngoài bài, hệ thống từ chối thay vì đoán.”

## 105–120 giây — Đánh giá và Responsible AI

“Cùng source ID được dùng cho summary, flashcard và quiz. Chúng tôi đo event, Q-A, groundedness, abstention và accessibility. Chèn tại đây 2–4 metric đã được human-verified: [METRIC PENDING]. LectureBridge ưu tiên privacy, transparency, abstention và human oversight—AI hỗ trợ việc học, không che giấu giới hạn.”
