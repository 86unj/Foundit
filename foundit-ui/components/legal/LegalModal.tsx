'use client';

import { Dialog, Portal, Stack, Heading, Text, Button } from '@chakra-ui/react';

interface LegalModalProps {
  open: boolean;
  onClose: () => void;
  onAgree?: () => void;
  onDisagree?: () => void;
}

export default function LegalModal({
  open,
  onClose,
  onAgree,
  onDisagree,
}: LegalModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) {
          onClose();
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />

        <Dialog.Positioner>
          <Dialog.Content maxW="700px">
            <Dialog.Header>
              <Dialog.Title>Legal Documents</Dialog.Title>
            </Dialog.Header>

            <Dialog.Body maxH="500px" overflowY="auto">
              <Stack gap={8}>
                <Stack gap={3}>
                  <Heading size="md">Privacy Policy</Heading>

                  <Text>
                    FoundIt collects limited personal information to provide
                    Lost & Found services for authorized users.
                  </Text>

                  {/*  Privacy  */}
                  <Text>
                    FoundIt collects limited personal information to provide
                    Lost & Found services for authorized users.
                  </Text>

                  <Text>
                    <b>Information We Collect</b>
                  </Text>

                  <Text>
                    • First and last name
                    <br />
                    • Seneca email address
                    <br />
                    • Account credentials
                    <br />
                    • Lost and found item reports
                    <br />• Images uploaded with reports
                  </Text>

                  <Text>
                    <b>How We Use Your Information</b>
                  </Text>

                  <Text>
                    Your information is used only to create and manage your
                    account, identify users, process lost and found reports,
                    communicate with you regarding submitted items, and improve
                    the operation of this service.
                  </Text>

                  <Text>
                    We do not sell or share your personal information with third
                    parties except where required by law.
                  </Text>
                </Stack>

                <Stack gap={3}>
                  <Heading size="md">Security Statement</Heading>
                  <Text>
                    FoundIt is committed to protecting your personal information
                    through reasonable technical and administrative safeguards.
                  </Text>

                  <Text>
                    <b>Security Measures</b>
                  </Text>

                  <Text>
                    • Secure user authentication
                    <br />
                    • Encrypted communication using HTTPS
                    <br />
                    • Restricted access to authorized personnel
                    <br />• Secure storage of uploaded files and account
                    information
                  </Text>

                  <Text>
                    While reasonable security measures are in place, no Internet
                    transmission or electronic storage method can be guaranteed
                    to be completely secure.
                  </Text>

                  {/* Security */}
                </Stack>

                <Stack gap={3}>
                  <Heading size="md">FIPPA Notice</Heading>

                  {/*  FIPPA  */}
                  <Text>
                    Personal information collected through FoundIt is used
                    solely for the administration of the Lost & Found service.
                  </Text>

                  <Text>
                    Information such as your name and Seneca email address is
                    collected for identification, communication, and account
                    management purposes.
                  </Text>

                  <Text>
                    Your personal information will only be accessed by
                    authorized personnel when necessary to operate the service
                    or when required by applicable law.
                  </Text>

                  <Text>
                    By creating an account, you acknowledge that you have read
                    and understood this Privacy Policy, Security Statement, and
                    FIPPA Notice.
                  </Text>
                </Stack>
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Button
                onClick={onDisagree}
                variant="outline"
                colorScheme="gray"
                bg="white"
                color="black"
              >
                Disagree
              </Button>

              <Button onClick={onAgree}>Agree</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
