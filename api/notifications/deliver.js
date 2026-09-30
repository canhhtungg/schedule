import { createNotificationDeliverHandler } from '../../server/notificationHandlers.js'

export const config = { api: { bodyParser: false } }
export default createNotificationDeliverHandler()
