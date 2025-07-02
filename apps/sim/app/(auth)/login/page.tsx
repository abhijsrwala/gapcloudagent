import { getOAuthProviderStatus } from '../components/oauth-provider-checker'
import LoginForm from './login-form'

export default async function LoginPage() {
  const { githubAvailable, googleAvailable, isProduction, dynamics365Available } = await getOAuthProviderStatus()

  return (
    <LoginForm
      githubAvailable={githubAvailable}
      googleAvailable={googleAvailable}
      isProduction={isProduction}
    />
  )
}
