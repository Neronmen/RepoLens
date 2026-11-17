// Mỗi khu vực có một file riêng để nhiều người sửa cùng lúc không đụng nhau.
import app from './app'
import landing from './landing'

export default { ...app, ...landing } as const
