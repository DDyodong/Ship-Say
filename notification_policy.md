# 확인 기반 안전 알림 정책

## 발송 원칙

- PPE 재촬영처럼 영향 범위가 개인의 재검사 안내에 한정되는 알림만 자동 발송한다.
- 작업자 신고의 처리 결과는 관리자가 상태를 저장한 경우에만 발송한다.
- 관리자가 직접 작성하는 알림은 대상과 내용을 미리 본 후 명시적으로 발송한다.
- 단체 방송과 작업 중단 지시는 이 기능의 범위에 포함하지 않는다.
- 업무 데이터 저장과 알림 발송을 분리한다. FCM 설정이나 수신 기기가 없어도 업무 처리는 성공하고 앱 알림함에는 기록이 남는다.

## 알림 유형

### `ppe_retry`

`POST /api/ai/personal-checks/{id}/result`가 다음 조건을 모두 만족하면 자동 생성한다.

- `status=retry_required`
- `reasonCode=PPE_MISSING`
- `missingItems`가 비어 있지 않음

동일한 PPE 검사에는 `ppe-retry:{ppeCheckId}` 중복 키를 사용해 한 번만 발송한다.

### `report_status`

관리자가 `POST /api/safety-events/{id}/actions`를 호출할 때 `notifyReporter=true`를 전달한 경우에만 생성한다. 동일 이벤트와 동일 상태 조합에는 한 번만 발송한다.

```json
{
  "status": "resolved",
  "comment": "현장 안전난간 보강을 완료했습니다.",
  "notifyReporter": true
}
```

### `admin_confirmed`

관리자가 선택한 작업자 한 명에게 직접 발송한다. 서버에서도 `confirmed=true`를 필수로 검사한다.

```http
POST /api/admin/notifications/send
```

```json
{
  "userId": 42,
  "eventId": 125,
  "title": "안전 관리자 알림",
  "body": "현장 안전관리자의 지시에 따라 주세요.",
  "url": "/worker/work",
  "confirmed": true
}
```

## 저장 및 전달 상태

- `notifications.status=sent`: 작업자 앱 알림함에 저장됨
- `push_status=sent`: 등록된 모든 FCM 기기에 발송 성공
- `push_status=partial`: 일부 기기 발송 성공
- `push_status=failed`: 모든 FCM 기기 발송 실패
- `push_status=no_device`: 활성 수신 기기 없음
- `push_status=not_configured`: Firebase Admin 미설정

FCM 발송 여부와 관계없이 작업자는 `/api/notifications/today`에서 앱 알림을 조회할 수 있다. 알림 발송 결과는 `audit_logs`에 `NOTIFICATION_SENT` 작업으로 기록한다.
